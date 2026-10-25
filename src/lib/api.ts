import type { Role, User } from './types';
import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const TOKEN_KEY = 'jansamvad_jwt_token_v1';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface AuthSignupRequest {
  fullName: string;
  email: string;
  password: string;
  mobileNumber: string;
  role?: string;
}

export interface AuthSigninRequest {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  token: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  accessStatus: string;
  requestedRole: string | null;
  ward: string | null;
  department: string | null;
  mobileNumber: string;
}

export interface UserResponseDto {
  id: number;
  fullName: string;
  email: string;
  mobileNumber: string;
  role: string;
  accessStatus: string;
  requestedRole: string | null;
  ward: string | null;
  department: string | null;
  createdAt: string;
}

function mapRole(role: string): Role {
  const r = role.toUpperCase();
  if (r === 'CITIZEN') return 'citizen';
  if (r === 'MUNICIPAL_AUTHORITY') return 'authority';
  if (r === 'FIELD_WORKFORCE') return 'workforce';
  if (r === 'INFLUENCER_REPORTER' || r === 'INFLUENCER') return 'influencer';
  if (r === 'ADMIN') return 'admin';
  return 'citizen';
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  mobile_number: string;
  role: string;
  ward: string | null;
  department: string | null;
  access_status?: string;
}

function profileToUser(p: ProfileRow): User {
  return {
    id: p.id,
    name: p.full_name,
    email: p.email,
    role: mapRole(p.role),
    phone: p.mobile_number,
    area: p.ward || 'Pimpri-Chinchwad',
  };
}

const PRIVILEGED_ROLES = ['MUNICIPAL_AUTHORITY', 'FIELD_WORKFORCE', 'INFLUENCER_REPORTER'];

export interface ApiSignupResult {
  token: string;
  user: User;
  accessStatus: string;
  requestedRole: string | null;
}

export async function apiSignup(req: AuthSignupRequest): Promise<ApiSignupResult> {
  const requestedRole = (req.role || 'CITIZEN').toUpperCase();
  const isPrivileged = PRIVILEGED_ROLES.includes(requestedRole);
  const assignedRole = isPrivileged ? 'CITIZEN' : requestedRole;
  const accessStatus = isPrivileged ? 'PENDING' : 'APPROVED';

  const { data, error } = await supabase.auth.signUp({
    email: req.email,
    password: req.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('Sign up failed: no user returned');
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email: req.email,
    full_name: req.fullName,
    mobile_number: req.mobileNumber,
    role: assignedRole,
    access_status: accessStatus,
    requested_role: isPrivileged ? requestedRole : null,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const token = data.session?.access_token || '';
  if (token) saveToken(token);

  const user = profileToUser({
    id: data.user.id,
    email: req.email,
    full_name: req.fullName,
    mobile_number: req.mobileNumber,
    role: assignedRole,
    ward: null,
    department: null,
  });

  return {
    token,
    user,
    accessStatus,
    requestedRole: isPrivileged ? requestedRole : null,
  };
}

export async function apiSignin(req: AuthSigninRequest): Promise<{ token: string; user: User }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.email,
    password: req.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('Sign in failed: no user returned');
  }

  const token = data.session?.access_token || '';
  if (token) saveToken(token);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, mobile_number, role, ward, department, access_status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error('Profile not found. Please contact an administrator.');
  }

  if (profile.access_status === 'PENDING') {
    await supabase.auth.signOut();
    clearToken();
    throw new Error('Your account is pending admin approval. Please wait for an administrator to approve your request.');
  }

  if (profile.access_status === 'REJECTED') {
    await supabase.auth.signOut();
    clearToken();
    throw new Error('Your access request has been rejected. Please contact an administrator.');
  }

  const user = profileToUser(profile);
  return { token, user };
}

export async function apiGetMe(): Promise<User> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, mobile_number, role, ward, department')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!profile) {
    throw new Error('Profile not found');
  }

  return profileToUser(profile);
}

export async function isBackendAvailable(): Promise<boolean> {
  if (import.meta.env.VITE_API_URL) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/signin`, {
        method: 'OPTIONS',
      });
      return res.ok || res.status === 401 || res.status === 400;
    } catch {
      return false;
    }
  }
  return false;
}

// ---- Complaint API (uses Spring Boot backend if VITE_API_URL is set) ----

export interface ComplaintRequestDto {
  title: string;
  description: string;
  category: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  videoName?: string;
  priority?: string;
  department?: string;
  aiCategory?: string;
  aiDepartment?: string;
  aiPriority?: string;
  aiConfidence?: number;
  aiSeverity?: number;
  aiSummary?: string;
  aiSuggestedAction?: string;
}

export interface ComplaintResponseDto {
  id: number;
  complaintNumber: string;
  citizenId: number;
  citizenName: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  priority: string | null;
  department: string | null;
  aiCategory: string | null;
  aiDepartment: string | null;
  aiPriority: string | null;
  aiConfidence: number | null;
  aiSeverity: number | null;
  aiSuggestedAction: string | null;
  aiSummary: string | null;
  status: string;
  taskStatus: string | null;
  assignedWorkerId: number | null;
  assignedWorkerName: string | null;
  imageUrl: string | null;
  videoName: string | null;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  resolutionNote: string | null;
  rewardPoints: number;
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  timeline: { status: string; timestamp: string; actor: string; note: string | null }[];
}

export async function apiCreateComplaint(req: ComplaintRequestDto): Promise<ComplaintResponseDto> {
  const res = await fetch(`${API_BASE}/api/complaints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  return handleResponse<ComplaintResponseDto>(res);
}

export async function apiGetUserComplaints(userId: string): Promise<ComplaintResponseDto[]> {
  const res = await fetch(`${API_BASE}/api/complaints/user/${userId}`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<ComplaintResponseDto[]>(res);
}

export async function apiGetComplaint(id: string): Promise<ComplaintResponseDto> {
  const res = await fetch(`${API_BASE}/api/complaints/${id}`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<ComplaintResponseDto>(res);
}

export async function apiUpdateComplaintStatus(id: string, status: string, taskStatus?: string, note?: string): Promise<ComplaintResponseDto> {
  const res = await fetch(`${API_BASE}/api/complaints/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status, taskStatus, note }),
  });
  return handleResponse<ComplaintResponseDto>(res);
}

// ---- Chat API (uses Spring Boot backend if VITE_API_URL is set) ----

export interface ChatMessageDto {
  message: string;
  conversationId?: number;
}

export interface ChatReplyDto {
  conversationId: number;
  reply: string;
}

export interface ChatConversationDto {
  id: number;
  userId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageItemDto[];
}

export interface ChatMessageItemDto {
  id: number;
  conversationId: number;
  sender: string;
  message: string;
  createdAt: string;
}

export async function apiSendMessage(message: string, conversationId?: number): Promise<ChatReplyDto> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message, conversationId }),
    });
  } catch {
    throw new Error(
      `Cannot reach backend at ${API_BASE}. The Spring Boot server is not running or VITE_API_URL is not set correctly.`
    );
  }
  return handleResponse<ChatReplyDto>(res);
}

export async function apiGetConversations(): Promise<ChatConversationDto[]> {
  const res = await fetch(`${API_BASE}/api/chat/conversations`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<ChatConversationDto[]>(res);
}

export async function apiGetConversationMessages(id: number): Promise<ChatConversationDto> {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<ChatConversationDto>(res);
}

export async function apiDeleteConversation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete conversation (${res.status})`);
  }
}

// ---- Admin Access Request API (Supabase-backed) ----

export interface AccessRequestDto {
  id: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  currentRole: string;
  requestedRole: string | null;
  accessStatus: string;
  createdAt: string;
}

export async function apiGetPendingRequests(): Promise<AccessRequestDto[]> {
  const { data, error } = await supabase.rpc('get_pending_access_requests');
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    fullName: row.full_name as string,
    email: row.email as string,
    mobileNumber: row.mobile_number as string,
    currentRole: row.user_role as string,
    requestedRole: (row.requested_role as string) || null,
    accessStatus: row.access_status as string,
    createdAt: row.created_at as string,
  }));
}

export async function apiApproveRequest(userId: string): Promise<AccessRequestDto> {
  const { error } = await supabase.rpc('approve_access_request', {
    target_uuid: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return {
    id: userId,
    fullName: '',
    email: '',
    mobileNumber: '',
    currentRole: '',
    requestedRole: null,
    accessStatus: 'APPROVED',
    createdAt: '',
  };
}

export async function apiRejectRequest(userId: string): Promise<AccessRequestDto> {
  const { error } = await supabase.rpc('reject_access_request', {
    target_uuid: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return {
    id: userId,
    fullName: '',
    email: '',
    mobileNumber: '',
    currentRole: '',
    requestedRole: null,
    accessStatus: 'REJECTED',
    createdAt: '',
  };
}
