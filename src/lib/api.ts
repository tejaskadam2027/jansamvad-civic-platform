import type { Role, User } from './types';
import { supabase } from './supabase';

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
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
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
    token: data.session?.access_token || '',
    user,
    accessStatus,
    requestedRole: isPrivileged ? requestedRole : null,
  };
}

export interface ApiSigninResult {
  token: string;
  user: User;
  accessStatus: string;
  requestedRole: string | null;
}

export async function apiSignin(req: AuthSigninRequest): Promise<ApiSigninResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.email,
    password: req.password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) {
      throw new Error('Invalid email or password. Please check your credentials and try again.');
    }
    if (msg.includes('email not confirmed')) {
      throw new Error('Your email has not been confirmed. Please contact an administrator.');
    }
    if (msg.includes('failed to fetch') || msg.includes('network')) {
      throw new Error('Could not connect to the server. Please check your internet connection and try again.');
    }
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('Sign in failed: no user returned');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, mobile_number, role, ward, department, access_status, requested_role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error('Could not load your profile. Please try again or contact an administrator.');
  }

  if (!profile) {
    throw new Error('Your profile was not found. Please contact an administrator.');
  }

  const user = profileToUser(profile);
  return {
    token: data.session?.access_token || '',
    user,
    accessStatus: profile.access_status || 'APPROVED',
    requestedRole: profile.requested_role || null,
  };
}

export interface ApiGetMeResult {
  user: User;
  accessStatus: string;
}

export async function apiGetMe(): Promise<ApiGetMeResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, mobile_number, role, ward, department, access_status')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error('Could not load your profile. Please try again.');
  }

  if (!profile) {
    throw new Error('Your profile was not found. Please contact an administrator.');
  }

  return {
    user: profileToUser(profile),
    accessStatus: profile.access_status || 'APPROVED',
  };
}

// ---- Chat API (Supabase Edge Function "chat-assistant") ----
// The assistant runs as a Supabase Edge Function so the AI provider key stays server-side.
// The user's access token is attached automatically by the supabase client.

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
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageItemDto[];
}

export interface ChatMessageItemDto {
  id: number;
  sender: string;
  message: string;
  createdAt: string;
}

async function chatFunction(path: string, init?: { method?: string; body?: unknown }): Promise<Response> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Please sign in to use the assistant.');
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant${path}`;
  return fetch(url, {
    method: init?.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

export async function apiSendMessage(message: string, conversationId?: number): Promise<ChatReplyDto> {
  let res: Response;
  try {
    res = await chatFunction('/message', { method: 'POST', body: { message, conversationId } });
  } catch {
    throw new Error('I could not reach the assistant service. Please check your connection and try again.');
  }
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json(); detail = b?.error || ''; } catch { /* ignore */ }
    throw new Error(detail || `The assistant service returned an error (${res.status}).`);
  }
  const data = await res.json() as ChatReplyDto;
  if (typeof data?.reply !== 'string' || !data.reply) {
    throw new Error('The assistant returned an empty response. Please try again.');
  }
  return data;
}

export async function apiGetConversations(): Promise<ChatConversationDto[]> {
  try {
    const res = await chatFunction('/conversations', { method: 'GET' });
    if (!res.ok) return [];
    const data = await res.json() as Omit<ChatConversationDto, 'messages'>[];
    return data.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt || (c as { created_at?: string }).created_at || '',
      updatedAt: c.updatedAt || (c as { updated_at?: string }).updated_at || '',
      messages: [],
    }));
  } catch {
    return [];
  }
}

export async function apiGetConversationMessages(id: number): Promise<ChatConversationDto> {
  const res = await chatFunction(`/conversations/${id}/messages`, { method: 'GET' });
  if (!res.ok) {
    throw new Error('Could not load this conversation.');
  }
  const raw = await res.json() as {
    id: number; title: string; created_at?: string; updated_at?: string; createdAt?: string; updatedAt?: string;
    messages?: { id: number; sender: string; message: string; created_at?: string; createdAt?: string }[];
  };
  return {
    id: raw.id,
    title: raw.title,
    createdAt: raw.createdAt || raw.created_at || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    messages: (raw.messages || []).map((m) => ({
      id: m.id,
      sender: m.sender,
      message: m.message,
      createdAt: m.createdAt || m.created_at || '',
    })),
  };
}

export async function apiDeleteConversation(id: number): Promise<void> {
  const res = await chatFunction(`/conversations/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    throw new Error('Could not delete this conversation.');
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
