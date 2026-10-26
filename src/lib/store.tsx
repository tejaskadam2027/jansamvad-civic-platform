import { createContext, useContext, useEffect, useState, type ReactNode, useCallback } from 'react';
import type {
  AppState,
  User,
  Complaint,
  Notification,
  RewardEntry,
  Campaign,
  Priority,
  Role,
} from './types';
import { getInitialState } from './mockData';
import { analyzeComplaint } from './ai';
import { apiSignup, apiSignin, apiGetMe } from './api';
import { supabase } from './supabase';

const STORAGE_KEY = 'jansamvad_state_v1';

type AuthStatus = 'loading' | 'authenticated' | 'pending' | 'rejected' | 'unauthenticated';

interface StoreContextValue extends AppState {
  authStatus: AuthStatus;
  login: (user: User) => void;
  logout: () => void;
  signUp: (name: string, email: string, password: string, role: Role, phone: string) => Promise<{ ok: true; pending: boolean } | { ok: false; error: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: true; pending: boolean } | { ok: false; error: string }>;
  addComplaint: (c: Omit<Complaint, 'id' | 'status' | 'timeline' | 'createdAt' | 'rewardPoints'>) => Promise<Complaint>;
  fetchUserComplaints: (userId: string) => Promise<void>;
  fetchAllComplaints: () => Promise<void>;
  fetchComplaint: (id: string) => Promise<Complaint | null>;
  updateComplaint: (id: string, patch: Partial<Complaint>) => void;
  addTimelineEvent: (id: string, status: string, actor: string, note?: string) => void;
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (role: Role, userId: string) => void;
  addReward: (r: Omit<RewardEntry, 'id' | 'timestamp'>) => void;
  addCampaign: (c: Omit<Campaign, 'id' | 'createdAt' | 'reach' | 'clicks' | 'newUsers' | 'complaintsGenerated' | 'engagementRate'>) => Campaign;
  assignWorkforce: (complaintId: string, workforceId: string) => void;
  verifyComplaint: (id: string) => void;
  rejectComplaint: (id: string) => void;
  resolveComplaint: (id: string, beforePhotoUrl: string, afterPhotoUrl: string, note: string) => void;
  setComplaintPriority: (id: string, priority: Priority) => void;
  updateTaskStatus: (id: string, taskStatus: Complaint['taskStatus']) => void;
  toast: (message: string, type?: 'info' | 'success' | 'warning') => void;
  toasts: { id: string; message: string; type: 'info' | 'success' | 'warning' }[];
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function loadState(): AppState {
  const base = getInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      return { ...parsed, currentUser: null };
    }
  } catch {
    // ignore
  }
  return base;
}

function mapBackendStatus(status: string): Complaint['status'] {
  const map: Record<string, Complaint['status']> = {
    'REGISTERED': 'Submitted',
    'AI_ANALYZED': 'Submitted',
    'VERIFIED': 'Verified',
    'ASSIGNED': 'Assigned',
    'IN_PROGRESS': 'In Progress',
    'RESOLVED': 'Resolved',
    'REJECTED': 'Rejected',
  };
  return map[status] || 'Submitted';
}

function mapBackendPriority(priority: string | null): Priority {
  if (!priority) return 'Medium';
  const p = priority.toUpperCase();
  if (p === 'HIGH') return 'High';
  if (p === 'LOW') return 'Low';
  return 'Medium';
}

interface DbComplaintRow {
  complaint_number: string;
  citizen_id: string;
  citizen_name: string;
  title: string;
  description: string;
  category: string;
  department: string;
  priority: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  video_name: string | null;
  status: string;
  task_status: string | null;
  assigned_worker_id: string | null;
  assigned_worker_name: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  resolution_note: string | null;
  reward_points: number;
  created_at: string;
}

function mapDbComplaint(row: DbComplaintRow): Complaint {
  return {
    id: row.complaint_number,
    title: row.title,
    description: row.description,
    category: row.category,
    department: row.department || '',
    priority: mapBackendPriority(row.priority),
    confidence: 0,
    location: row.location || '',
    coordinates: { lat: row.latitude || 0, lng: row.longitude || 0 },
    citizenId: row.citizen_id,
    citizenName: row.citizen_name,
    status: mapBackendStatus(row.status),
    taskStatus: (row.task_status as Complaint['taskStatus']) || undefined,
    assignedWorkforceId: row.assigned_worker_id || undefined,
    assignedWorkforceName: row.assigned_worker_name || undefined,
    imageUrl: row.image_url || undefined,
    videoName: row.video_name || undefined,
    beforePhotoUrl: row.before_photo_url || undefined,
    afterPhotoUrl: row.after_photo_url || undefined,
    resolutionNote: row.resolution_note || undefined,
    rewardPoints: row.reward_points,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    timeline: [],
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' }[]>([]);

  useEffect(() => {
    try {
      const { currentUser, ...persist } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
    } catch {
      // ignore
    }
  }, [state]);

  // Restore session on mount and listen for auth changes.
  // Wrap async work in IIFE to avoid onAuthStateChange deadlock.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) {
        setAuthStatus('unauthenticated');
        return;
      }
      try {
        const result = await apiGetMe();
        if (!mounted) return;
        if (result.accessStatus === 'PENDING') {
          setAuthStatus('pending');
          setState((s) => ({ ...s, currentUser: result.user }));
        } else if (result.accessStatus === 'REJECTED') {
          setAuthStatus('rejected');
          setState((s) => ({ ...s, currentUser: result.user }));
        } else {
          setAuthStatus('authenticated');
          setState((s) => ({ ...s, currentUser: result.user }));
        }
      } catch {
        if (!mounted) return;
        setAuthStatus('unauthenticated');
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (!session) {
          setAuthStatus('unauthenticated');
          setState((s) => ({ ...s, currentUser: null }));
          return;
        }
        try {
          const result = await apiGetMe();
          if (result.accessStatus === 'PENDING') {
            setAuthStatus('pending');
            setState((s) => ({ ...s, currentUser: result.user }));
          } else if (result.accessStatus === 'REJECTED') {
            setAuthStatus('rejected');
            setState((s) => ({ ...s, currentUser: result.user }));
          } else {
            setAuthStatus('authenticated');
            setState((s) => ({ ...s, currentUser: result.user }));
          }
        } catch {
          setAuthStatus('unauthenticated');
          setState((s) => ({ ...s, currentUser: null }));
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const toast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = `t${Date.now()}${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const login = useCallback((user: User) => {
    setAuthStatus('authenticated');
    setState((s) => ({ ...s, currentUser: user }));
  }, []);

  const logout = useCallback(() => {
    supabase.auth.signOut().catch(() => {});
    setAuthStatus('unauthenticated');
    setState((s) => ({ ...s, currentUser: null }));
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, role: Role, phone: string) => {
    const roleMap: Record<Role, string> = {
      citizen: 'CITIZEN',
      authority: 'MUNICIPAL_AUTHORITY',
      workforce: 'FIELD_WORKFORCE',
      influencer: 'INFLUENCER_REPORTER',
      admin: 'CITIZEN',
    };
    try {
      const result = await apiSignup({
        fullName: name,
        email,
        password,
        mobileNumber: phone,
        role: roleMap[role],
      });
      const pending = result.accessStatus === 'PENDING';
      if (pending) {
        setAuthStatus('pending');
        setState((s) => ({ ...s, currentUser: result.user }));
      } else {
        setAuthStatus('authenticated');
        setState((s) => ({ ...s, currentUser: result.user }));
      }
      return { ok: true as const, pending };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      return { ok: false as const, error: message };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await apiSignin({ email, password });
      if (result.accessStatus === 'PENDING') {
        setAuthStatus('pending');
        setState((s) => ({ ...s, currentUser: result.user }));
        return { ok: true as const, pending: true };
      }
      if (result.accessStatus === 'REJECTED') {
        setAuthStatus('rejected');
        setState((s) => ({ ...s, currentUser: result.user }));
        return { ok: true as const, pending: false };
      }
      setAuthStatus('authenticated');
      setState((s) => ({ ...s, currentUser: result.user }));
      return { ok: true as const, pending: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid email or password';
      return { ok: false as const, error: message };
    }
  }, []);

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    setState((s) => ({
      ...s,
      notifications: [
        { ...n, id: `n${Date.now()}${Math.random()}`, timestamp: Date.now(), read: false },
        ...s.notifications,
      ],
    }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback((role: Role, userId: string) => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) =>
        n.role === role && n.userId === userId ? { ...n, read: true } : n
      ),
    }));
  }, []);

  const addReward = useCallback((r: Omit<RewardEntry, 'id' | 'timestamp'>) => {
    setState((s) => ({
      ...s,
      rewards: [{ ...r, id: `r${Date.now()}${Math.random()}`, timestamp: Date.now() }, ...s.rewards],
    }));
  }, []);

  const addTimelineEvent = useCallback((id: string, status: string, actor: string, note?: string) => {
    setState((s) => ({
      ...s,
      complaints: s.complaints.map((c) =>
        c.id === id
          ? { ...c, timeline: [...c.timeline, { status, timestamp: Date.now(), actor, note }] }
          : c
      ),
    }));
  }, []);

  const addComplaint = useCallback(
    async (c: Omit<Complaint, 'id' | 'status' | 'timeline' | 'createdAt' | 'rewardPoints'>) => {
      const { data: number, error: numError } = await supabase.rpc('next_complaint_number');
      if (numError || !number) {
        throw new Error(numError?.message || 'Could not generate complaint number');
      }

      const { data: row, error: insertError } = await supabase
        .from('complaints')
        .insert({
          complaint_number: number,
          citizen_id: c.citizenId,
          citizen_name: c.citizenName,
          title: c.title,
          description: c.description,
          category: c.category,
          department: c.department,
          priority: c.priority.toUpperCase(),
          location: c.location || null,
          latitude: c.coordinates.lat || null,
          longitude: c.coordinates.lng || null,
          image_url: c.imageUrl || null,
          video_name: c.videoName || null,
          status: 'REGISTERED',
          reward_points: 50,
        })
        .select('id, complaint_number, created_at')
        .single();

      if (insertError || !row) {
        throw new Error(insertError?.message || 'Failed to save complaint');
      }

      const newComplaint: Complaint = {
        ...c,
        id: row.complaint_number,
        status: 'Submitted',
        taskStatus: undefined,
        rewardPoints: 50,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        timeline: [{ status: 'Submitted', timestamp: Date.now(), actor: c.citizenName }],
      };
      setState((s) => ({
        ...s,
        complaints: [newComplaint, ...s.complaints],
        rewards: [
          { id: `r${Date.now()}${Math.random()}`, citizenId: c.citizenId, points: 50, reason: 'Complaint submitted', complaintId: newComplaint.id, timestamp: Date.now() },
          ...s.rewards,
        ],
        notifications: [
          { id: `n${Date.now()}${Math.random()}`, role: 'citizen' as Role, userId: c.citizenId, title: 'Complaint Submitted', message: `Your complaint ${newComplaint.id} has been submitted. +50 reward points!`, read: false, timestamp: Date.now(), type: 'success' },
          ...s.notifications,
        ],
      }));
      return newComplaint;
    },
    []
  );

  const fetchUserComplaints = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('complaints')
      .select('id, complaint_number, citizen_id, citizen_name, title, description, category, department, priority, location, latitude, longitude, image_url, video_name, status, task_status, assigned_worker_id, assigned_worker_name, before_photo_url, after_photo_url, resolution_note, reward_points, created_at')
      .eq('citizen_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[fetchUserComplaints] Supabase query failed:', error.message);
      return;
    }
    const complaints = (data || []).map(mapDbComplaint);
    setState((s) => {
      const otherComplaints = s.complaints.filter((c) => c.citizenId !== userId);
      return { ...s, complaints: [...complaints, ...otherComplaints] };
    });
  }, []);

  const fetchAllComplaints = useCallback(async () => {
    const { data, error } = await supabase
      .from('complaints')
      .select('id, complaint_number, citizen_id, citizen_name, title, description, category, department, priority, location, latitude, longitude, image_url, video_name, status, task_status, assigned_worker_id, assigned_worker_name, before_photo_url, after_photo_url, resolution_note, reward_points, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[fetchAllComplaints] Supabase query failed:', error.message);
      return;
    }
    const complaints = (data || []).map(mapDbComplaint);
    setState((s) => ({ ...s, complaints }));
  }, []);

  const fetchComplaint = useCallback(async (id: string): Promise<Complaint | null> => {
    const { data, error } = await supabase
      .from('complaints')
      .select('id, complaint_number, citizen_id, citizen_name, title, description, category, department, priority, location, latitude, longitude, image_url, video_name, status, task_status, assigned_worker_id, assigned_worker_name, before_photo_url, after_photo_url, resolution_note, reward_points, created_at')
      .eq('complaint_number', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapDbComplaint(data);
  }, []);

  const updateComplaint = useCallback((id: string, patch: Partial<Complaint>) => {
    setState((s) => ({
      ...s,
      complaints: s.complaints.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const verifyComplaint = useCallback((id: string) => {
    void supabase.from('complaints').update({ status: 'VERIFIED', updated_at: new Date().toISOString() }).eq('complaint_number', id).then(({ error }) => {
      if (error) console.error('[verifyComplaint] DB update failed:', error.message);
    });
    setState((s) => {
      const complaint = s.complaints.find((c) => c.id === id);
      if (!complaint) return s;
      return {
        ...s,
        complaints: s.complaints.map((c) =>
          c.id === id
            ? {
              ...c,
              status: 'Verified',
              timeline: [...c.timeline, { status: 'Verified', timestamp: Date.now(), actor: 'Municipal Commissioner' }],
            }
            : c
        ),
        rewards: [
          { id: `r${Date.now()}${Math.random()}`, citizenId: complaint.citizenId, points: 20, reason: 'Complaint verified', complaintId: id, timestamp: Date.now() },
          ...s.rewards,
        ],
        notifications: [
          { id: `n${Date.now()}${Math.random()}`, role: 'citizen' as Role, userId: complaint.citizenId, title: 'Complaint Verified', message: `Your complaint ${id} has been verified. +20 bonus points!`, read: false, timestamp: Date.now(), type: 'success' },
          ...s.notifications,
        ],
      };
    });
  }, []);

  const rejectComplaint = useCallback((id: string) => {
    void supabase.from('complaints').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('complaint_number', id).then(({ error }) => {
      if (error) console.error('[rejectComplaint] DB update failed:', error.message);
    });
    setState((s) => {
      const complaint = s.complaints.find((c) => c.id === id);
      if (!complaint) return s;
      return {
        ...s,
        complaints: s.complaints.map((c) =>
          c.id === id
            ? {
              ...c,
              status: 'Rejected',
              timeline: [...c.timeline, { status: 'Rejected', timestamp: Date.now(), actor: 'Municipal Commissioner' }],
            }
            : c
        ),
        notifications: [
          { id: `n${Date.now()}${Math.random()}`, role: 'citizen' as Role, userId: complaint.citizenId, title: 'Complaint Rejected', message: `Your complaint ${id} has been rejected.`, read: false, timestamp: Date.now(), type: 'warning' },
          ...s.notifications,
        ],
      };
    });
  }, []);

  const assignWorkforce = useCallback((complaintId: string, workforceId: string) => {
    setState((s) => {
      const wf = s.workforce.find((w) => w.id === workforceId);
      const complaint = s.complaints.find((c) => c.id === complaintId);
      if (!wf || !complaint) return s;
      void supabase.from('complaints').update({ status: 'ASSIGNED', task_status: 'Assigned', assigned_worker_id: workforceId, assigned_worker_name: wf.name, updated_at: new Date().toISOString() }).eq('complaint_number', complaintId);
      return {
        ...s,
        complaints: s.complaints.map((c) =>
          c.id === complaintId
            ? {
              ...c,
              status: 'Assigned',
              taskStatus: 'Assigned',
              assignedWorkforceId: workforceId,
              assignedWorkforceName: wf.name,
              timeline: [...c.timeline, { status: 'Assigned', timestamp: Date.now(), actor: 'Municipal Commissioner', note: `Assigned to ${wf.name}` }],
            }
            : c
        ),
        workforce: s.workforce.map((w) =>
          w.id === workforceId ? { ...w, activeTasks: w.activeTasks + 1, availability: 'Busy' as const } : w
        ),
        notifications: [
          { id: `n${Date.now()}${Math.random()}`, role: 'workforce' as Role, userId: workforceId, title: 'New Task Assigned', message: `You have been assigned complaint ${complaintId}.`, read: false, timestamp: Date.now(), type: 'info' },
          { id: `n${Date.now()}${Math.random()}1`, role: 'citizen' as Role, userId: complaint.citizenId, title: 'Workforce Assigned', message: `Your complaint ${complaintId} has been assigned to ${wf.name}.`, read: false, timestamp: Date.now(), type: 'info' },
          ...s.notifications,
        ],
      };
    });
  }, []);

  const setComplaintPriority = useCallback((id: string, priority: Priority) => {
    void supabase.from('complaints').update({ priority: priority.toUpperCase(), updated_at: new Date().toISOString() }).eq('complaint_number', id);
    setState((s) => ({
      ...s,
      complaints: s.complaints.map((c) =>
        c.id === id
          ? { ...c, priority, timeline: [...c.timeline, { status: `Priority changed to ${priority}`, timestamp: Date.now(), actor: 'Municipal Commissioner' }] }
          : c
      ),
    }));
  }, []);

  const updateTaskStatus = useCallback((id: string, taskStatus: Complaint['taskStatus']) => {
    setState((s) => {
      const complaint = s.complaints.find((c) => c.id === id);
      if (!complaint) return s;
      const statusMap: Record<string, Complaint['status']> = {
        'Accepted': 'Assigned',
        'In Progress': 'In Progress',
        'Work Completed': 'In Progress',
        'Resolved': 'Resolved',
      };
      const newStatus = statusMap[taskStatus || ''] || complaint.status;
      const dbStatusMap: Record<string, string> = { 'Accepted': 'ASSIGNED', 'In Progress': 'IN_PROGRESS', 'Work Completed': 'IN_PROGRESS', 'Resolved': 'RESOLVED' };
      void supabase.from('complaints').update({ status: dbStatusMap[taskStatus || ''] || complaint.status.toUpperCase().replace(' ', '_'), task_status: taskStatus || null, updated_at: new Date().toISOString() }).eq('complaint_number', id);
      return {
        ...s,
        complaints: s.complaints.map((c) =>
          c.id === id
            ? {
              ...c,
              taskStatus: taskStatus || c.taskStatus,
              status: newStatus,
              timeline: [...c.timeline, { status: taskStatus || 'Updated', timestamp: Date.now(), actor: complaint.assignedWorkforceName || 'Workforce' }],
            }
            : c
        ),
      };
    });
  }, []);

  const resolveComplaint = useCallback((id: string, beforePhotoUrl: string, afterPhotoUrl: string, note: string) => {
    setState((s) => {
      const complaint = s.complaints.find((c) => c.id === id);
      if (!complaint) return s;
      void supabase.from('complaints').update({ status: 'RESOLVED', task_status: 'Resolved', before_photo_url: beforePhotoUrl || null, after_photo_url: afterPhotoUrl || null, resolution_note: note || null, reward_points: complaint.rewardPoints + 30, updated_at: new Date().toISOString() }).eq('complaint_number', id);
      return {
        ...s,
        complaints: s.complaints.map((c) =>
          c.id === id
            ? {
              ...c,
              status: 'Resolved',
              taskStatus: 'Resolved',
              beforePhotoUrl,
              afterPhotoUrl,
              resolutionNote: note,
              rewardPoints: c.rewardPoints + 30,
              timeline: [...c.timeline, { status: 'Resolved', timestamp: Date.now(), actor: c.assignedWorkforceName || 'Workforce', note }],
            }
            : c
        ),
        workforce: s.workforce.map((w) =>
          w.id === complaint.assignedWorkforceId
            ? { ...w, activeTasks: Math.max(0, w.activeTasks - 1), completedTasks: w.completedTasks + 1, availability: 'Available' as const }
            : w
        ),
        rewards: [
          { id: `r${Date.now()}${Math.random()}`, citizenId: complaint.citizenId, points: 30, reason: 'Complaint resolved', complaintId: id, timestamp: Date.now() },
          ...s.rewards,
        ],
        notifications: [
          { id: `n${Date.now()}${Math.random()}`, role: 'citizen' as Role, userId: complaint.citizenId, title: 'Complaint Resolved', message: `Your complaint ${id} has been resolved. +30 bonus points!`, read: false, timestamp: Date.now(), type: 'success' },
          { id: `n${Date.now()}${Math.random()}1`, role: 'authority' as Role, userId: 'a1', title: 'Complaint Resolved', message: `${complaint.assignedWorkforceName || 'Workforce'} resolved complaint ${id}.`, read: false, timestamp: Date.now(), type: 'success' },
          ...s.notifications,
        ],
      };
    });
  }, []);

  const addCampaign = useCallback(
    (c: Omit<Campaign, 'id' | 'createdAt' | 'reach' | 'clicks' | 'newUsers' | 'complaintsGenerated' | 'engagementRate'>) => {
      const newCampaign: Campaign = {
        ...c,
        id: `CMP-${String(Date.now()).slice(-3)}`,
        createdAt: Date.now(),
        reach: 0,
        clicks: 0,
        newUsers: 0,
        complaintsGenerated: 0,
        engagementRate: 0,
      };
      setState((s) => ({ ...s, campaigns: [newCampaign, ...s.campaigns] }));
      return newCampaign;
    },
    []
  );

  const value: StoreContextValue = {
    ...state,
    authStatus,
    toasts,
    toast,
    dismissToast,
    login,
    logout,
    signUp,
    signIn,
    addComplaint,
    fetchUserComplaints,
    fetchAllComplaints,
    fetchComplaint,
    updateComplaint,
    addTimelineEvent,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    addReward,
    addCampaign,
    assignWorkforce,
    verifyComplaint,
    rejectComplaint,
    resolveComplaint,
    setComplaintPriority,
    updateTaskStatus,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export { analyzeComplaint };
