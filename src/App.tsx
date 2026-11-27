import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  AlignLeft,
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  FileUp,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  CheckCheck,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from './lib/supabase';

type Tab =
  | 'messages'
  | 'meetings'
  | 'calendar'
  | 'dashboard'
  | 'tasks'
  | 'docs'
  | 'history'
  | 'inbox'
  | 'profile';
type HistoryFilter = 'all' | 'tasks' | 'meetings';
type Workspace = { id: string; name: string; owner_id: string };
type Channel = { id: string; workspace_id: string; name: string };
type Profile = {
  id: string;
  full_name: string | null;
  status: string | null;
  avatar_url: string | null;
  role: 'leader' | 'member' | null;
  leader_id: string | null;
};
type TeamMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};
type Task = {
  id: string;
  workspace_id: string;
  title: string;
  description?: string | null;
  reference_link?: string | null;
  status: 'todo' | 'in_progress' | 'done';
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  created_by?: string;
  target_type?: 'team' | 'personal';
  assignee_id?: string | null;
  instruction_file_url?: string | null;
  instruction_file_name?: string | null;
  submission_file_url?: string | null;
  submission_file_name?: string | null;
};
type WorkspaceMember = {
  id: string;
  full_name: string;
  role: string;
  leader_id?: string | null;
  status?: string | null;
};
type TeamEvent = {
  id: string;
  workspace_id: string;
  title: string;
  start_time: string;
  end_time: string;
  meeting_room_id: string | null;
  meeting_type?: 'online' | 'offline' | null;
  location?: string | null;
  created_by?: string;
};
type DocumentRecord = {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  updated_at?: string;
};
type DocumentRevision = {
  id: string;
  document_id: string;
  title: string;
  content: string;
  saved_by: string;
  created_at: string;
};
type NotificationRecord = {
  id: string;
  workspace_id: string;
  user_id?: string;
  type?: string;
  title: string;
  content: string;
  created_at: string;
  is_read?: boolean;
};
type PresenceStatus = 'Aktif bekerja' | 'Fokus / Rapat' | 'Istirahat';
type ModalType = 'help' | null;
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const navigation: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
  { id: 'messages', label: 'Pesan', icon: MessageSquare },
  { id: 'meetings', label: 'Rapat Video', icon: Video },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
  { id: 'tasks', label: 'Tugas', icon: CheckSquare },
  { id: 'docs', label: 'Notulensi', icon: FileText },
  { id: 'history', label: 'History', icon: History },
  { id: 'inbox', label: 'Kotak Masuk', icon: Bell },
];

const statusOptions: { value: PresenceStatus; label: string; emoji: string }[] = [
  { value: 'Aktif bekerja', label: 'Aktif bekerja', emoji: '🟢' },
  { value: 'Fokus / Rapat', label: 'Fokus / Rapat', emoji: '🎧' },
  { value: 'Istirahat', label: 'Istirahat', emoji: '🌴' },
];

const taskColumns: { status: Task['status']; label: string; color: string }[] = [
  { status: 'todo', label: 'To Do', color: 'bg-slate-400' },
  { status: 'in_progress', label: 'In Progress', color: 'bg-amber-400' },
  { status: 'done', label: 'Done', color: 'bg-emerald-400' },
];

const defaultChannels = ['general'];

function getMeetingLink(event: TeamEvent) {
  const room = event.meeting_room_id || event.id;
  return `https://meet.jit.si/${encodeURIComponent(room)}`;
}

function isOnlineEvent(event: TeamEvent) {
  return event.meeting_type === 'online' || (!event.meeting_type && Boolean(event.meeting_room_id));
}

function getHistoryPersonName(
  userId: string | undefined,
  members: WorkspaceMember[],
  leaders: { id: string; full_name: string }[],
  currentUserId?: string,
  currentUserName?: string | null
) {
  if (!userId) return 'Tidak diketahui';
  return (
    members.find((member) => member.id === userId)?.full_name ||
    leaders.find((leader) => leader.id === userId)?.full_name ||
    (userId === currentUserId ? currentUserName || 'Anda' : 'Anggota')
  );
}

function getTaskHistoryDate(task: Task) {
  return task.completed_at || task.updated_at || task.created_at;
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function csvCell(value: string | null | undefined) {
  const text = value ?? '';
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupRole, setSignupRole] = useState<'leader' | 'member'>('member');
  const [signupLeaderId, setSignupLeaderId] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [leaders, setLeaders] = useState<{ id: string; full_name: string }[]>([]);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskReferenceLink, setNewTaskReferenceLink] = useState('');
  const [taskTargetType, setTaskTargetType] = useState<'team' | 'personal'>('team');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskInstructionFile, setTaskInstructionFile] = useState<File | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [taskUploadBusyId, setTaskUploadBusyId] = useState<string | null>(null);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventMeetingType, setNewEventMeetingType] = useState<'online' | 'offline'>('online');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const documentTitleInputRef = useRef<HTMLInputElement>(null);
  const documentContentInputRef = useRef<HTMLTextAreaElement>(null);
  const focusDocumentAfterSelectRef = useRef(false);
  const [documentRevisions, setDocumentRevisions] = useState<DocumentRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [settingsFullName, setSettingsFullName] = useState('');
  const [settingsWorkspaceName, setSettingsWorkspaceName] = useState('');
  const [settingsAvatarUrl, setSettingsAvatarUrl] = useState('');
  const [settingsRole, setSettingsRole] = useState<'leader' | 'member'>('member');
  const [settingsLeaderId, setSettingsLeaderId] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const showError = useCallback((message: string) => {
    setNoticeIsError(true);
    setNotice(message);
  }, []);
  const showSuccess = useCallback((message: string) => {
    setNoticeIsError(false);
    setNotice(message);
  }, []);
  const navigateToTab = (tab: Tab) => {
    setActiveTab(tab);
    setActiveModal(null);
    setMobileDrawerOpen(false);
  };
  const openProfilePage = () => {
    setSettingsFullName(profile?.full_name || '');
    setSettingsWorkspaceName(workspace?.name || '');
    setSettingsAvatarUrl(profile?.avatar_url || '');
    setSettingsRole(profile?.role || (isWorkspaceLeader ? 'leader' : 'member'));
    setSettingsLeaderId(profile?.leader_id || '');
    setNotice('');
    navigateToTab('profile');
  };
  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Pilih file gambar untuk foto profil.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Ukuran gambar maksimal 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSettingsAvatarUrl(reader.result);
        setNotice('');
      } else {
        showError('File gambar tidak dapat dibaca.');
      }
    };
    reader.onerror = () => showError('Gagal membaca file gambar.');
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (_event === 'SIGNED_IN') setActiveTab('dashboard');
      if (!nextSession) {
        setWorkspace(null);
        setProfile(null);
        setActiveChannel(null);
        setMessages([]);
        setTasks([]);
        setEvents([]);
        setDocuments([]);
        setDocumentRevisions([]);
        setSelectedRevisionId(null);
        setNotifications([]);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    const initialTimer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initialTimer);
    };
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApplication = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (outcome === 'accepted') showSuccess('Team-Hub berhasil dipasang.');
    } catch (error) {
      showError(
        `Aplikasi tidak dapat dipasang: ${error instanceof Error ? error.message : 'terjadi kesalahan'}`
      );
    }
  };

  useEffect(() => {
    if (!isSignUp) return;
    let active = true;
    void supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'leader')
      .order('full_name')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthError(`Daftar Leader tidak dapat dimuat: ${error.message}`);
          return;
        }
        setLeaders(
          (data ?? []).map((leader) => ({
            id: leader.id,
            full_name: leader.full_name || 'Leader',
          }))
        );
      });
    return () => {
      active = false;
    };
  }, [isSignUp]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setActiveModal(null);
        setShowCreateMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, []);

  const refreshWorkspace = useCallback(async (user: User) => {
    const { data: memberships, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1);
    if (membershipError) throw membershipError;

    const { data: ownedWorkspaces, error: workspaceError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1);
    if (workspaceError) throw workspaceError;

    let currentWorkspace: Workspace | null = null;
    const memberWorkspaceId = memberships?.[0]?.workspace_id;
    if (memberWorkspaceId) {
      const { data: memberWorkspace, error: memberWorkspaceError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', memberWorkspaceId)
        .maybeSingle();
      if (memberWorkspaceError) throw memberWorkspaceError;
      currentWorkspace = memberWorkspace;
    }
    currentWorkspace ??= (ownedWorkspaces?.[0] as Workspace | undefined) ?? null;

    if (!currentWorkspace) {
      const { data: createdWorkspace, error: createError } = await supabase
        .from('workspaces')
        .insert({ name: 'Team-Hub Utama', owner_id: user.id })
        .select()
        .single();
      if (createError) throw createError;
      if (!createdWorkspace) throw new Error('Supabase tidak mengembalikan ruang kerja baru.');
      currentWorkspace = createdWorkspace as Workspace;

      const { error: memberError } = await supabase.from('workspace_members').insert({
        workspace_id: createdWorkspace.id,
        user_id: user.id,
        role: 'admin',
      });
      if (memberError) throw memberError;
    }

    if (!currentWorkspace) throw new Error('Ruang kerja tidak berhasil dimuat atau dibuat.');
    setWorkspace(currentWorkspace);
    const [
      { data: channelRows, error: channelError },
      { data: profileRow, error: profileError },
      { data: leaderRows, error: leadersError },
      { data: taskRows, error: taskError },
      { data: eventRows, error: eventError },
      { data: documentRows, error: documentError },
      { data: notificationRows, error: notificationError },
    ] = await Promise.all([
      supabase.from('channels').select('*').eq('workspace_id', currentWorkspace.id).order('name'),
      supabase
        .from('profiles')
        .select('id, full_name, status, avatar_url, role, leader_id')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'leader')
        .order('full_name'),
      supabase.from('tasks').select('*').eq('workspace_id', currentWorkspace.id).order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('workspace_id', currentWorkspace.id).order('start_time'),
      supabase.from('documents').select('*').eq('workspace_id', currentWorkspace.id).order('updated_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    const { data: membershipRows, error: membersError } = await supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', currentWorkspace.id);
    let loadedMembers: WorkspaceMember[] = [];
    if (membersError) {
      showError(`Anggota workspace tidak dapat dimuat: ${membersError.message}`);
    } else if (membershipRows?.length) {
      const { data: profileRows, error: membersProfileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, leader_id, status')
        .in('id', membershipRows.map((member) => member.user_id));
      if (membersProfileError) {
        showError(`Profil anggota tidak dapat dimuat: ${membersProfileError.message}`);
      } else {
        loadedMembers = (membershipRows ?? []).map((member) => ({
          id: member.user_id,
          full_name:
            profileRows?.find((profileRecord) => profileRecord.id === member.user_id)
              ?.full_name || 'Anggota',
          role:
            profileRows?.find((profileRecord) => profileRecord.id === member.user_id)
              ?.role || member.role || 'member',
          leader_id:
            profileRows?.find((profileRecord) => profileRecord.id === member.user_id)
              ?.leader_id || null,
          status:
            profileRows?.find((profileRecord) => profileRecord.id === member.user_id)
              ?.status || null,
        }));
      }
    }
    const { data: assignedProfileRows, error: assignedProfilesError } = await supabase
      .from('profiles')
      .select('id, full_name, role, leader_id, status')
      .eq('leader_id', user.id);
    if (assignedProfilesError) {
      showError(`Anggota binaan tidak dapat dimuat: ${assignedProfilesError.message}`);
    } else {
      const loadedMemberIds = new Set(loadedMembers.map((member) => member.id));
      loadedMembers = [
        ...loadedMembers,
        ...(assignedProfileRows ?? [])
          .filter((member) => !loadedMemberIds.has(member.id))
          .map((member) => ({
            id: member.id,
            full_name: member.full_name || 'Anggota',
            role: member.role || 'member',
            leader_id: member.leader_id || null,
            status: member.status || null,
          })),
      ];
    }

    const errors = [
      channelError,
      profileError,
      leadersError,
      taskError,
      eventError,
      documentError,
      notificationError,
    ].filter((error) => error !== null);
    if (errors.length > 0) {
      showError(
        `Gagal memuat data: ${errors.map((error) => error.message).join(' · ')}`
      );
    }

    let loadedChannels = (channelRows ?? []) as Channel[];
    if (!channelError) {
      const missingChannels = defaultChannels.filter(
        (name) => !loadedChannels.some((channel) => channel.name === name)
      );
      if (missingChannels.length > 0) {
        const { data: insertedChannels, error: seedError } = await supabase
          .from('channels')
          .insert(missingChannels.map((name) => ({ workspace_id: currentWorkspace.id, name })))
          .select();
        if (seedError) {
          showError(`Gagal menyiapkan kanal: ${seedError.message}`);
        } else if (insertedChannels) {
          loadedChannels = [...loadedChannels, ...(insertedChannels as Channel[])].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        }
      }
    }

    setActiveChannel((selected) => {
      if (selected && loadedChannels.some((channel) => channel.id === selected.id)) {
        return loadedChannels.find((channel) => channel.id === selected.id) ?? null;
      }
      return loadedChannels.find((channel) => channel.name === 'general') ?? loadedChannels[0] ?? null;
    });
    if (profileRow) setProfile(profileRow as Profile);
    if (leaderRows) {
      setLeaders(
        leaderRows.map((leader) => ({
          id: leader.id,
          full_name: leader.full_name || 'Leader',
        }))
      );
    }
    setMembers(loadedMembers);
    if (taskRows) setTasks(taskRows as Task[]);
    if (eventRows) setEvents(eventRows as TeamEvent[]);
    if (documentRows) setDocuments(documentRows as DocumentRecord[]);
    if (notificationRows) setNotifications(notificationRows as NotificationRecord[]);
  }, [showError]);

  useEffect(() => {
    if (!session?.user) return;
    // Supabase reads complete asynchronously and then populate the signed-in workspace state.
    const timer = window.setTimeout(() => {
      void refreshWorkspace(session.user).catch((error: Error) =>
        showError(`Gagal memuat workspace: ${error.message}`)
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshWorkspace, session, showError]);

  useEffect(() => {
    if (!session?.user || !workspace) return;
    let active = true;
    const notificationChannel = supabase
      .channel(`notifications-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          if (!active) return;
          const notification = payload.new as NotificationRecord;
          if (notification.workspace_id === workspace.id) {
            setNotifications((previous) =>
              previous.some((item) => item.id === notification.id)
                ? previous
                : [notification, ...previous]
            );
          }
        }
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(notificationChannel);
    };
  }, [session, workspace]);

  useEffect(() => {
    if (!activeChannel) return;

    let active = true;
    const realtimeChannel = supabase
      .channel(`messages-${activeChannel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        async (payload) => {
          const row = payload.new as TeamMessage;
          const { data: senderProfile, error } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', row.sender_id)
            .maybeSingle();
          if (error) showError(`Gagal memuat profil pengirim: ${error.message}`);
          if (active) {
            setMessages((previous) =>
              previous.some((message) => message.id === row.id)
                ? previous
                : [...previous, { ...row, profiles: senderProfile }]
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          showError('Koneksi realtime pesan gagal. Periksa konfigurasi Realtime Supabase.');
        }
      });

    void supabase
      .from('messages')
      .select('*, profiles(full_name)')
      .eq('channel_id', activeChannel.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) showError(`Gagal memuat pesan: ${error.message}`);
        if (active && data) {
          setMessages((previous) => {
            const mergedMessages = new Map(
              (data as TeamMessage[]).map((message) => [message.id, message])
            );
            previous.forEach((message) => {
              if (!mergedMessages.has(message.id)) mergedMessages.set(message.id, message);
            });
            return [...mergedMessages.values()].sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(realtimeChannel);
    };
  }, [activeChannel, showError]);

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((message) => message.content.toLowerCase().includes(term));
  }, [messages, search]);

  const currentUser = session?.user;
  const isWorkspaceLeader = profile?.role
    ? profile.role === 'leader'
    : Boolean(
        currentUser &&
          workspace &&
          (workspace.owner_id === currentUser.id ||
            members.some(
              (member) =>
                member.id === currentUser.id &&
                ['admin', 'leader'].includes(member.role.toLowerCase())
            ))
      );
  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) => {
          if (isWorkspaceLeader) {
            return (
              task.created_by === currentUser?.id ||
              (task.target_type === 'personal' &&
                members.some(
                  (member) =>
                    member.id === task.assignee_id && member.leader_id === currentUser?.id
                ))
            );
          }
          return (
            Boolean(profile?.leader_id) &&
            task.created_by === profile?.leader_id &&
            (task.target_type !== 'personal' || task.assignee_id === currentUser?.id)
          );
        }
      ),
    [currentUser, isWorkspaceLeader, members, profile?.leader_id, tasks]
  );
  const activeTaskCount = visibleTasks.filter(
    (task) => task.status === 'todo' || task.status === 'in_progress'
  ).length;
  const completedTaskCount = visibleTasks.filter((task) => task.status === 'done').length;
  const supervisedMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.leader_id === currentUser?.id && member.role.toLowerCase() !== 'leader'
      ),
    [currentUser?.id, members]
  );
  const memberPriorityTasks = useMemo(
    () =>
      visibleTasks
        .filter((task) => task.status === 'in_progress' || task.status === 'todo')
        .sort((a, b) => {
          const statusOrder = { in_progress: 0, todo: 1, done: 2 };
          return (
            statusOrder[a.status] - statusOrder[b.status] ||
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
        })
        .slice(0, 5),
    [visibleTasks]
  );
  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? visibleTasks.filter((task) => task.title.toLowerCase().includes(term))
      : visibleTasks;
  }, [search, visibleTasks]);

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? documents.filter(
          (document) =>
            document.title.toLowerCase().includes(term) ||
            document.content.toLowerCase().includes(term)
        )
      : documents;
  }, [documents, search]);

  const historyTasks = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return visibleTasks
      .filter((task) => task.status === 'done' || Boolean(task.submission_file_url))
      .sort((a, b) => {
        const aTime = getTaskHistoryDate(a);
        const bTime = getTaskHistoryDate(b);
        return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
      })
      .filter((task) => {
        if (!term) return true;
        const leaderName = getHistoryPersonName(
          task.created_by,
          members,
          leaders,
          currentUser?.id,
          profile?.full_name
        );
        const executorName = task.assignee_id
          ? getHistoryPersonName(
              task.assignee_id,
              members,
              leaders,
              currentUser?.id,
              profile?.full_name
            )
          : 'Seluruh Tim';
        return [
          task.title,
          task.description,
          task.instruction_file_name,
          task.submission_file_name,
          leaderName,
          executorName,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(term));
      });
  }, [currentUser?.id, historySearch, leaders, members, profile?.full_name, visibleTasks]);
  const historyEvents = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return [...events]
      .sort(
        (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      )
      .filter((event) => {
        if (!term) return true;
        const organizerName = getHistoryPersonName(
          event.created_by,
          members,
          leaders,
          currentUser?.id,
          profile?.full_name
        );
        const meetingType = isOnlineEvent(event) ? 'rapat online' : 'rapat offline';
        return [event.title, event.location, organizerName, meetingType]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(term));
      });
  }, [currentUser?.id, events, historySearch, leaders, members, profile?.full_name]);

  const downloadHistoryCsv = () => {
    const taskRows =
      historyFilter === 'meetings'
        ? []
        : historyTasks.map((task) => [
            'Tugas',
            task.title,
            task.description || '',
            getHistoryPersonName(
              task.created_by,
              members,
              leaders,
              currentUser?.id,
              profile?.full_name
            ),
            task.assignee_id
              ? getHistoryPersonName(
                  task.assignee_id,
                  members,
                  leaders,
                  currentUser?.id,
                  profile?.full_name
                )
              : 'Seluruh Tim',
            getTaskHistoryDate(task)
              ? new Date(getTaskHistoryDate(task)!).toLocaleString('id-ID')
              : '',
            task.status,
            '',
            '',
            task.instruction_file_url || '',
            task.submission_file_url || '',
            '',
          ]);
    const eventRows =
      historyFilter === 'tasks'
        ? []
        : historyEvents.map((event) => [
            'Rapat',
            event.title,
            '',
            getHistoryPersonName(
              event.created_by,
              members,
              leaders,
              currentUser?.id,
              profile?.full_name
            ),
            '',
            new Date(event.start_time).toLocaleString('id-ID'),
            '',
            isOnlineEvent(event) ? 'Online' : event.meeting_type === 'offline' ? 'Offline' : 'Agenda',
            event.location || '',
            '',
            '',
            isOnlineEvent(event) ? getMeetingLink(event) : '',
          ]);
    const rows = [
      [
        'Jenis',
        'Judul',
        'Deskripsi',
        'Leader / Penjadwal',
        'Pelaksana',
        'Tanggal',
        'Status',
        'Tipe Rapat',
        'Lokasi',
        'Dokumen Tugas',
        'Dokumen Hasil',
        'Link Rapat',
      ],
      ...taskRows,
      ...eventRows,
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `team-hub-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const upcomingEvents = useMemo(
    () => events.filter((event) => new Date(event.end_time).getTime() >= currentTime),
    [currentTime, events]
  );
  const upcomingAgendaEvents = useMemo(
    () =>
      events
        .filter((event) => new Date(event.start_time).getTime() >= currentTime)
        .sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        ),
    [currentTime, events]
  );
  const activeMeetings = useMemo(() => {
    return events.filter(
      (event) =>
        isOnlineEvent(event) &&
        new Date(event.start_time).getTime() <= currentTime &&
        new Date(event.end_time).getTime() >= currentTime
    );
  }, [currentTime, events]);
  const pendingTaskCount = visibleTasks.filter((task) => task.status !== 'done').length;
  const unreadNotificationCount = notifications.filter((notification) => !notification.is_read).length;
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedRevision =
    documentRevisions.find((revision) => revision.id === selectedRevisionId) ?? null;

  useEffect(() => {
    if (!focusDocumentAfterSelectRef.current || !selectedDocument) return;
    focusDocumentAfterSelectRef.current = false;
    const titleInput = documentTitleInputRef.current;
    if (titleInput) {
      titleInput.focus();
      titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
      return;
    }
    documentContentInputRef.current?.focus();
  }, [selectedDocument, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void supabase
        .from('document_revisions')
        .select('*')
        .eq('document_id', selectedDocumentId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            showError(`Riwayat notulensi tidak dapat dimuat: ${error.message}`);
            return;
          }
          if (active && data) setDocumentRevisions(data as DocumentRevision[]);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selectedDocumentId, showError]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    const result = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim() || email.split('@')[0] || 'Pengguna',
              role: signupRole,
              leader_id: signupRole === 'member' ? signupLeaderId : null,
            },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthError(result.error.message);
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newMessage.trim() || !activeChannel || !session?.user) return;
    const content = newMessage.trim();
    setNewMessage('');
    const { error } = await supabase.from('messages').insert({
      channel_id: activeChannel.id,
      sender_id: session.user.id,
      content,
    });
    if (error) {
      setNewMessage(content);
      showError(`Pesan tidak terkirim: ${error.message}`);
    }
  };

  const recordActivityNotification = async (
    _type: string,
    title: string,
    content: string,
    recipientId = session?.user.id
  ) => {
    if (!workspace || !session?.user) return false;
    if (!recipientId) return false;
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        workspace_id: workspace.id,
        user_id: recipientId,
        title,
        content,
      })
      .select()
      .single();
    if (error) {
      showError(`Aktivitas dibuat, tetapi notifikasi tidak tersimpan: ${error.message}`);
      return false;
    }
    if (recipientId === session.user.id) {
      setNotifications((previous) => [data as NotificationRecord, ...previous]);
    }
    return true;
  };

  const markAllNotificationsRead = async () => {
    if (!workspace || !session?.user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('workspace_id', workspace.id)
      .eq('user_id', session?.user.id ?? '');
    if (error) {
      showError(`Notifikasi tidak dapat ditandai sudah dibaca: ${error.message}`);
      return;
    }
    setNotifications((previous) => previous.map((item) => ({ ...item, is_read: true })));
    showSuccess('Semua notifikasi ditandai sudah dibaca.');
  };

  const deleteNotification = async (notificationId: string) => {
    if (!session?.user) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', session?.user.id ?? '');
    if (error) {
      showError(`Notifikasi tidak dapat dihapus: ${error.message}`);
      return;
    }
    setNotifications((previous) => previous.filter((item) => item.id !== notificationId));
  };

  const handleAddTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTaskTitle.trim() || !workspace || !session?.user) return;
    if (!isWorkspaceLeader) {
      showError('Hanya Admin atau Leader yang dapat membuat tugas.');
      return;
    }
    if (taskTargetType === 'personal' && !taskAssigneeId) {
      showError('Pilih anggota untuk tugas personal.');
      return;
    }
    if (
      taskTargetType === 'personal' &&
      !members.some(
        (member) => member.id === taskAssigneeId && member.leader_id === session.user.id
      )
    ) {
      showError('Pilih anggota binaan yang valid untuk tugas personal.');
      return;
    }
    setBusy(true);
    let instructionPath: string | null = null;
    let instructionUrl: string | null = null;
    let instructionName: string | null = null;
    if (taskInstructionFile) {
      instructionName = taskInstructionFile.name;
      instructionPath = `${workspace.id}/tasks/${crypto.randomUUID()}-${taskInstructionFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(instructionPath, taskInstructionFile);
      if (uploadError) {
        setBusy(false);
        showError(`Dokumen instruksi tidak dapat diunggah: ${uploadError.message}`);
        return;
      }
      instructionUrl = supabase.storage.from('task-files').getPublicUrl(instructionPath).data.publicUrl;
    }
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        workspace_id: workspace.id,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null,
        reference_link: newTaskReferenceLink.trim() || null,
        status: 'todo',
        created_by: session.user.id,
        target_type: taskTargetType,
        assignee_id: taskTargetType === 'personal' ? taskAssigneeId : null,
        instruction_file_url: instructionUrl,
        instruction_file_name: instructionName,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      if (instructionPath) {
        const { error: cleanupError } = await supabase.storage.from('task-files').remove([instructionPath]);
        showError(
          cleanupError
            ? `Tugas tidak dapat dibuat: ${error.message}. File instruksi juga tidak dapat dibersihkan: ${cleanupError.message}`
            : `Tugas tidak dapat dibuat: ${error.message}`
        );
      } else {
        showError(`Tugas tidak dapat dibuat: ${error.message}`);
      }
      return;
    }
    setTasks((previous) => [data as Task, ...previous]);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskReferenceLink('');
    setTaskInstructionFile(null);
    setTaskAssigneeId('');
    if (taskTargetType === 'personal') {
      await recordActivityNotification(
        'task_assigned',
        'Tugas baru untuk Anda',
        `Anda mendapat tugas: ${data.title}`,
        taskAssigneeId
      );
    }
  };

  const notifyTaskLeaderCompletion = async (task: Task) => {
    if (!workspace || !session?.user || isWorkspaceLeader) return;
    const memberName =
      members.find((member) => member.id === session.user.id)?.full_name || 'Anggota';
    const recipientId = profile?.leader_id || task.created_by;
    if (!recipientId || recipientId === session.user.id) return;
    await recordActivityNotification(
      'task_completed',
      'Tugas selesai',
      `${memberName} telah menyelesaikan tugas: ${task.title}`,
      recipientId
    );
  };

  const uploadTaskFile = async (task: Task, file: File, kind: 'instruction' | 'submission') => {
    if (!workspace || !session?.user) return;
    setTaskUploadBusyId(task.id);
    const path = `${workspace.id}/tasks/${task.id}/${kind}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('task-files').upload(path, file);
    if (uploadError) {
      setTaskUploadBusyId(null);
      showError(`File tugas tidak dapat diunggah: ${uploadError.message}`);
      return;
    }
    const fileUrl = supabase.storage.from('task-files').getPublicUrl(path).data.publicUrl;
    const update =
      kind === 'instruction'
        ? { instruction_file_url: fileUrl, instruction_file_name: file.name }
        : { submission_file_url: fileUrl, submission_file_name: file.name };
    const { error: updateError } = await supabase.from('tasks').update(update).eq('id', task.id);
    setTaskUploadBusyId(null);
    if (updateError) {
      const { error: cleanupError } = await supabase.storage.from('task-files').remove([path]);
      showError(
        cleanupError
          ? `File terunggah, tetapi tugas tidak dapat diperbarui: ${updateError.message}. File sementara juga gagal dibersihkan: ${cleanupError.message}`
          : `File terunggah, tetapi tugas tidak dapat diperbarui: ${updateError.message}`
      );
      return;
    }
    const updatedTask = { ...task, ...update };
    setTasks((previous) => previous.map((item) => (item.id === task.id ? updatedTask : item)));
    if (kind === 'submission') await notifyTaskLeaderCompletion(updatedTask);
  };

  const updateTaskStatus = async (task: Task, status: Task['status']) => {
    const previousStatus = task.status;
    setTasks((previous) =>
      previous.map((item) => (item.id === task.id ? { ...item, status } : item))
    );
    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id);
    if (error) {
      setTasks((previous) =>
        previous.map((item) =>
          item.id === task.id ? { ...item, status: previousStatus } : item
        )
      );
      showError(`Status tugas tidak dapat diperbarui: ${error.message}`);
      return;
    }
    if (status === 'done' && previousStatus !== 'done') {
      await notifyTaskLeaderCompletion({ ...task, status });
    }
  };

  const resetEventForm = () => {
    setEditingEventId(null);
    setNewEventTitle('');
    setNewEventDate('');
    setNewEventMeetingType('online');
    setNewEventLocation('');
  };

  const startEditingEvent = (event: TeamEvent) => {
    setEditingEventId(event.id);
    setNewEventTitle(event.title);
    setNewEventDate(toDateTimeLocalValue(event.start_time));
    setNewEventMeetingType(isOnlineEvent(event) ? 'online' : 'offline');
    setNewEventLocation(event.location || '');
    setNotice('');
  };

  const handleAddEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newEventTitle.trim() || !newEventDate || !workspace || !session?.user) return;
    if (newEventMeetingType === 'offline' && !newEventLocation.trim()) {
      showError('Tempat / Lokasi Rapat wajib diisi untuk rapat offline.');
      return;
    }
    const start = new Date(newEventDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const existingEvent = events.find((item) => item.id === editingEventId);
    if (editingEventId && !existingEvent) {
      showError('Agenda yang akan diedit tidak ditemukan.');
      return;
    }
    const eventValues = {
      title: newEventTitle.trim(),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      meeting_type: newEventMeetingType,
      location: newEventMeetingType === 'offline' ? newEventLocation.trim() : null,
      meeting_room_id:
        newEventMeetingType === 'online'
          ? existingEvent?.meeting_room_id || `teamhub-${crypto.randomUUID().slice(0, 10)}`
          : null,
    };
    const wasEditing = Boolean(editingEventId);
    setBusy(true);
    const request = editingEventId
      ? supabase
          .from('events')
          .update(eventValues)
          .eq('id', editingEventId)
          .eq('workspace_id', workspace.id)
          .select()
          .single()
      : supabase
          .from('events')
          .insert({ ...eventValues, workspace_id: workspace.id, created_by: session.user.id })
          .select()
          .single();
    const { data, error } = await request;
    setBusy(false);
    if (error) {
      showError(
        wasEditing
          ? `Jadwal tidak dapat diperbarui: ${error.message}`
          : `Jadwal tidak dapat dibuat: ${error.message}`
      );
      return;
    }
    const savedEvent = data as TeamEvent;
    setEvents((previous) =>
      [...previous.filter((item) => item.id !== savedEvent.id), savedEvent].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    );
    resetEventForm();
    if (wasEditing) {
      showSuccess('Jadwal berhasil diperbarui.');
      return;
    }
    const meetingDetails =
      newEventMeetingType === 'online'
        ? 'Rapat Online'
        : `Rapat Offline di ${newEventLocation.trim()}`;
    const notificationSaved = await recordActivityNotification(
      'event_created',
      `${meetingDetails} dijadwalkan`,
      `${savedEvent.title} — ${meetingDetails}, ${start.toLocaleString('id-ID')}.`
    );
    if (notificationSaved) showSuccess('Jadwal rapat dan notifikasi berhasil disimpan.');
  };

  const deleteEvent = async (event: TeamEvent) => {
    const confirmed = window.confirm(
      `Hapus agenda "${event.title}"? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed || !workspace) return;
    setBusy(true);
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', event.id)
      .eq('workspace_id', workspace.id)
      .select('id')
      .single();
    setBusy(false);
    if (error) {
      showError(`Agenda tidak dapat dihapus: ${error.message}`);
      return;
    }
    setEvents((previous) => previous.filter((item) => item.id !== event.id));
    if (editingEventId === event.id) resetEventForm();
    showSuccess('Agenda berhasil dihapus.');
  };

  const createInstantMeeting = async () => {
    if (!workspace || !session?.user) return;
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const roomId = `teamhub-${crypto.randomUUID().slice(0, 10)}`;
    setBusy(true);
    const { data, error } = await supabase
      .from('events')
      .insert({
        workspace_id: workspace.id,
        title: `Rapat instan - ${profile?.full_name || session.user.email || 'Tim'}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        meeting_type: 'online',
        location: null,
        meeting_room_id: roomId,
        created_by: session.user.id,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      showError(`Rapat instan tidak dapat dibuat: ${error.message}`);
      return;
    }
    const meeting = data as TeamEvent;
    setEvents((previous) => [meeting, ...previous]);
    window.open(getMeetingLink(meeting), '_blank', 'noopener,noreferrer');
    await recordActivityNotification(
      'event_created',
      'Rapat instan dimulai',
      `${meeting.title} dimulai pada ${start.toLocaleString('id-ID')}.`
    );
  };

  const copyMeetingLink = async (event: TeamEvent) => {
    try {
      await navigator.clipboard.writeText(getMeetingLink(event));
      showSuccess('Link undangan rapat berhasil disalin.');
    } catch (error) {
      showError(
        `Tidak dapat menyalin link: ${error instanceof Error ? error.message : 'akses clipboard ditolak'}`
      );
    }
  };

  const createDocument = async () => {
    if (!workspace || !session?.user) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('documents')
      .insert({
        workspace_id: workspace.id,
        title: 'Notulensi baru',
        content: '',
        created_by: session.user.id,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      showError(`Notulensi tidak dapat dibuat: ${error.message}`);
      return;
    }
    const document = data as DocumentRecord;
    setDocuments((previous) => [document, ...previous]);
    focusDocumentAfterSelectRef.current = true;
    setSelectedDocumentId(document.id);
    setDocumentRevisions([]);
    setSelectedRevisionId(null);
    setDocumentTitle(document.title);
    setDocumentContent(document.content);
    navigateToTab('docs');
    setShowCreateMenu(false);
  };

  const handleSaveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDocument || !session?.user || !workspace) return;
    const savedTitle = documentTitle.trim() || 'Tanpa judul';
    const savedContent = documentContent;
    const updatedAt = new Date().toISOString();
    setBusy(true);
    const { data, error } = await supabase
      .from('documents')
      .update({
        title: savedTitle,
        content: savedContent,
        updated_at: updatedAt,
        updated_by: session.user.id,
      })
      .eq('id', selectedDocument.id)
      .eq('workspace_id', workspace.id)
      .select()
      .single();
    if (error) {
      setBusy(false);
      showError(`Notulensi tidak dapat disimpan: ${error.message}`);
      return;
    }
    const saved = data as DocumentRecord;
    setDocuments((previous) =>
      previous.map((document) => (document.id === saved.id ? saved : document))
    );
    setDocumentTitle(saved.title);
    setDocumentContent(saved.content);

    const { data: revision, error: revisionError } = await supabase
      .from('document_revisions')
      .insert({
        document_id: saved.id,
        title: saved.title,
        content: saved.content,
        saved_by: session.user.id,
      })
      .select()
      .single();
    setBusy(false);
    if (revisionError) {
      showError(
        `Notulensi berhasil disimpan, tetapi snapshot riwayat gagal dibuat: ${revisionError.message}`
      );
      return;
    }
    if (revision) {
      const savedRevision = revision as DocumentRevision;
      setDocumentRevisions((previous) =>
        [savedRevision, ...previous].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
      setSelectedRevisionId(savedRevision.id);
    }
    showSuccess('Notulensi berhasil disimpan.');
  };

  const restoreDocumentRevision = async (revision: DocumentRevision) => {
    if (!selectedDocument || !workspace || !session?.user) return;
    const updatedAt = new Date().toISOString();
    setBusy(true);
    const { data, error } = await supabase
      .from('documents')
      .update({
        title: revision.title,
        content: revision.content,
        updated_at: updatedAt,
        updated_by: session.user.id,
      })
      .eq('id', selectedDocument.id)
      .eq('workspace_id', workspace.id)
      .select()
      .single();
    if (error) {
      setBusy(false);
      showError(`Versi notulensi tidak dapat dipulihkan: ${error.message}`);
      return;
    }

    const restoredDocument = data as DocumentRecord;
    setDocuments((previous) =>
      previous.map((document) =>
        document.id === restoredDocument.id ? restoredDocument : document
      )
    );
    setDocumentTitle(restoredDocument.title);
    setDocumentContent(restoredDocument.content);

    const { data: newRevision, error: revisionError } = await supabase
      .from('document_revisions')
      .insert({
        document_id: restoredDocument.id,
        title: restoredDocument.title,
        content: restoredDocument.content,
        saved_by: session.user.id,
      })
      .select()
      .single();
    setBusy(false);
    if (revisionError) {
      showError(
        `Versi berhasil dipulihkan, tetapi snapshot pemulihan gagal dibuat: ${revisionError.message}`
      );
      return;
    }
    if (newRevision) {
      const restoredRevision = newRevision as DocumentRevision;
      setDocumentRevisions((previous) => [restoredRevision, ...previous]);
      setSelectedRevisionId(restoredRevision.id);
    }
    showSuccess('Versi notulensi berhasil dipulihkan.');
  };

  const selectDocument = (document: DocumentRecord) => {
    setSelectedDocumentId(document.id);
    setDocumentRevisions([]);
    setSelectedRevisionId(null);
    setDocumentTitle(document.title);
    setDocumentContent(document.content);
  };

  const editDocument = (document: DocumentRecord) => {
    if (selectedDocumentId === document.id) {
      const titleInput = documentTitleInputRef.current;
      if (titleInput) {
        titleInput.focus();
        titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
      } else {
        documentContentInputRef.current?.focus();
      }
      return;
    }
    focusDocumentAfterSelectRef.current = true;
    selectDocument(document);
  };

  const deleteDocument = async (document: DocumentRecord) => {
    const confirmed = window.confirm(
      `Hapus notulensi "${document.title || 'Tanpa judul'}"? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setBusy(true);
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', document.id)
      .eq('workspace_id', document.workspace_id);
    setBusy(false);
    if (error) {
      showError(`Notulensi tidak dapat dihapus: ${error.message}`);
      return;
    }

    setDocuments((previous) => previous.filter((item) => item.id !== document.id));
    if (selectedDocumentId === document.id) {
      setSelectedDocumentId(null);
      setDocumentRevisions([]);
      setSelectedRevisionId(null);
      setDocumentTitle('');
      setDocumentContent('');
    }
    showSuccess('Notulensi berhasil dihapus.');
  };

  const updatePresence = async (status: PresenceStatus) => {
    if (!session?.user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', session.user.id);
    if (error) {
      showError(`Status profil tidak dapat diperbarui: ${error.message}`);
      return;
    }
    setProfile((previous) =>
      previous
        ? { ...previous, status }
        : {
            id: session.user.id,
            full_name: null,
            status,
            avatar_url: null,
            role: null,
            leader_id: null,
          }
    );
    showSuccess(`Status diubah menjadi ${status}.`);
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user || !workspace) return;
    const nextFullName = settingsFullName.trim();
    const nextWorkspaceName = settingsWorkspaceName.trim();
    const nextAvatarUrl = settingsAvatarUrl.trim();
    if (!nextFullName || !nextWorkspaceName) {
      showError('Nama pengguna dan nama workspace tidak boleh kosong.');
      return;
    }
    if (settingsRole === 'member' && !settingsLeaderId) {
      showError('Pilih Leader pembimbing untuk akun Member.');
      return;
    }
    if (
      nextAvatarUrl &&
      !nextAvatarUrl.startsWith('data:image/') &&
      !/^https?:\/\//i.test(nextAvatarUrl)
    ) {
      showError('URL foto harus menggunakan http:// atau https://.');
      return;
    }

    setBusy(true);
    if (
      nextFullName !== (profile?.full_name ?? '') ||
      nextAvatarUrl !== (profile?.avatar_url ?? '') ||
      settingsRole !== (profile?.role ?? 'member') ||
      (settingsRole === 'member' ? settingsLeaderId : null) !== (profile?.leader_id ?? null)
    ) {
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: session.user.id,
            full_name: nextFullName,
            avatar_url: nextAvatarUrl || null,
            role: settingsRole,
            leader_id: settingsRole === 'member' ? settingsLeaderId : null,
          },
          { onConflict: 'id' }
        )
        .select('id, full_name, status, avatar_url, role, leader_id')
        .single();
      if (error) {
        setBusy(false);
        showError(`Profil tidak dapat disimpan: ${error.message}`);
        return;
      }
      setProfile(updatedProfile as Profile);
    }

    if (nextWorkspaceName !== workspace.name) {
      const { data, error } = await supabase
        .from('workspaces')
        .update({ name: nextWorkspaceName })
        .eq('id', workspace.id)
        .select()
        .single();
      if (error) {
        setBusy(false);
        showError(`Nama workspace tidak dapat disimpan: ${error.message}`);
        return;
      }
      setWorkspace(data as Workspace);
    }

    setBusy(false);
    showSuccess('Pengaturan berhasil disimpan.');
  };

  const openNewTask = () => {
    navigateToTab('tasks');
    setShowCreateMenu(false);
    window.setTimeout(() => document.getElementById('new-task-title')?.focus(), 0);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 animate-pulse text-indigo-400" />
          Memuat Team-Hub...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-2 flex items-center gap-2 text-2xl font-bold text-indigo-400">
            <Sparkles className="h-6 w-6" />
            <span>Team-Hub</span>
          </div>
          <p className="mb-6 text-sm text-slate-400">
            {isSignUp ? 'Buat akun ruang kerja baru Anda' : 'Masuk ke ruang kerja kolaborasi Anda'}
          </p>
          {authError && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {authError}
            </div>
          )}
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <>
                <label className="block text-xs text-slate-400">
                  Nama Lengkap
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                    placeholder="Contoh: Pak Derry"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Pilih Peran
                  <select
                    value={signupRole}
                    onChange={(event) => {
                      setSignupRole(event.target.value as 'leader' | 'member');
                      setSignupLeaderId('');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="leader">Leader</option>
                    <option value="member">Member</option>
                  </select>
                </label>
                {signupRole === 'member' && (
                  <label className="block text-xs text-slate-400">
                    Pilih Leader Pembimbing
                    <select
                      required
                      value={signupLeaderId}
                      onChange={(event) => setSignupLeaderId(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">Pilih Leader...</option>
                      {leaders.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.full_name}
                        </option>
                      ))}
                    </select>
                    {leaders.length === 0 && (
                      <span className="mt-1 block text-amber-300">
                        Belum ada Leader terdaftar.
                      </span>
                    )}
                  </label>
                )}
              </>
            )}
            <label className="block text-xs text-slate-400">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="nama@email.com"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="Minimal 6 karakter"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              {isSignUp ? 'Daftar Sekarang' : 'Masuk'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setIsSignUp((value) => !value)}
            className="mt-4 w-full text-xs text-slate-400 transition hover:text-indigo-300"
          >
            {isSignUp ? 'Sudah punya akun? Masuk di sini' : 'Belum punya akun? Daftar gratis'}
          </button>
        </div>
      </div>
    );
  }

  const displayName = profile?.full_name || session.user.email || 'Pengguna';
  const displayRole = isWorkspaceLeader ? 'leader' : 'member';
  const mentorName = leaders.find((leader) => leader.id === profile?.leader_id)?.full_name;
  const roleBadge =
    displayRole === 'leader'
      ? '👑 Leader'
      : `👤 Member${mentorName ? ` • Leader: ${mentorName}` : ''}`;
  const avatarInitial = displayName[0]?.toUpperCase() || 'U';
  const currentStatus =
    statusOptions.find((option) => option.value === profile?.status) ?? statusOptions[0];
  const activeTabTitle =
    activeTab === 'profile'
      ? 'Profil & Pengaturan Akun'
      : navigation.find((item) => item.id === activeTab)?.label ?? 'Team-Hub';

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-slate-950 text-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(85vw,272px)] flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 md:static md:z-auto md:w-auto md:shrink-0 md:translate-x-0 md:transition-[width] ${
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-[76px]' : 'md:w-[272px]'}`}
      >
        <div className={`flex h-16 items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <button
            type="button"
            onClick={() => navigateToTab('messages')}
            className="flex min-w-0 items-center gap-2.5 text-left"
            aria-label="Team-Hub beranda"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
              <Sparkles className="h-5 w-5" />
            </span>
            {!collapsed && <span className="truncate text-base font-bold tracking-tight">Team-Hub</span>}
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 md:block"
              title="Ciutkan sidebar"
              aria-label="Ciutkan sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 md:hidden"
            aria-label="Tutup menu"
          >
            <X className="h-4 w-4" />
          </button>
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="absolute left-[58px] top-5 z-20 hidden rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 md:block"
              title="Perluas sidebar"
              aria-label="Perluas sidebar"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className={`px-3 ${collapsed ? 'space-y-2' : 'space-y-3'}`}>
          {!collapsed ? (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari pesan, tugas, notulensi..."
                aria-label="Pencarian cepat"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-500/70"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex w-full justify-center rounded-lg p-2.5 text-slate-400 hover:bg-slate-800"
              title="Buka pencarian"
              aria-label="Buka pencarian"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCreateMenu((value) => !value)}
              className={`flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/20 transition hover:bg-indigo-500 ${
                collapsed ? 'px-2' : 'px-3'
              }`}
              aria-expanded={showCreateMenu}
            >
              <Plus className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Tambah +</span>}
            </button>
            {showCreateMenu && (
              <div className="absolute left-0 top-full z-30 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-800 p-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={openNewTask}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                >
                  <CheckSquare className="h-4 w-4 text-indigo-300" />
                  Buat Tugas
                </button>
                <button
                  type="button"
                  onClick={() => void createDocument()}
                  disabled={busy}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  <FileText className="h-4 w-4 text-indigo-300" />
                  Notulensi Baru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigateToTab('calendar');
                    setShowCreateMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                >
                  <CalendarDays className="h-4 w-4 text-indigo-300" />
                  Jadwalkan Rapat
                </button>
              </div>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="px-5 pb-2 pt-6">
            <p className="truncate text-xs font-medium text-slate-500">
              {workspace?.name || 'Ruang kerja'}
            </p>
          </div>
        )}
        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {navigation.map(({ id, label, icon: Icon }) => {
            const count =
              id === 'tasks'
                ? pendingTaskCount
                : id === 'messages'
                  ? messages.length
                  : id === 'meetings'
                    ? activeMeetings.length
                    : id === 'calendar'
                      ? upcomingEvents.length
                      : id === 'docs'
                        ? documents.length
                        : id === 'inbox'
                          ? unreadNotificationCount
                          : 0;
            return (
              <React.Fragment key={id}>
                <button
                  type="button"
                  onClick={() => navigateToTab(id)}
                  title={collapsed ? label : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                    activeTab === id
                      ? 'bg-indigo-500/10 font-medium text-indigo-300'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                  } ${collapsed ? 'justify-center px-2' : ''}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="flex-1 text-left">{label}</span>}
                  {!collapsed && count > 0 && (
                    <span
                      className={`min-w-5 rounded-md px-1.5 py-0.5 text-center text-[10px] ${
                        activeTab === id
                          ? 'bg-indigo-500/15 text-indigo-200'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {collapsed && count > 0 && (
                    <span className="absolute ml-5 mt-[-18px] h-2 w-2 rounded-full bg-indigo-400" />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {installPrompt && (
          <div className="shrink-0 px-3 pb-3">
            <button
              type="button"
              onClick={() => void installApplication()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-3 py-2.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/20"
            >
              <Download className="h-4 w-4 shrink-0" />
              {!collapsed && 'Install Aplikasi'}
            </button>
          </div>
        )}

        <div className={`shrink-0 border-t border-slate-800 p-3 ${collapsed ? 'space-y-2' : 'space-y-3'}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openProfilePage}
              title={collapsed ? `${displayName} · ${roleBadge}` : 'Profil dan pengaturan'}
              aria-label="Buka profil dan pengaturan"
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-slate-800 ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-sm font-bold text-white">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${displayName} avatar`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  avatarInitial
                )}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
                  <span className="block truncate">{displayName}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-normal text-indigo-300">
                    {roleBadge}
                  </span>
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void supabase.auth.signOut()}
              title="Keluar"
              aria-label="Keluar"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <select
              value={currentStatus.value}
              onChange={(event) => void updatePresence(event.target.value as PresenceStatus)}
              aria-label="Status kehadiran"
              className="w-full cursor-pointer appearance-none rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 pr-7 text-xs text-slate-300 outline-none hover:border-slate-700 focus:border-indigo-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-900">
                  {option.emoji} {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => setActiveModal('help')}
              title="Bantuan"
              aria-label="Bantuan"
              className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && 'Bantuan'}
            </button>
          </div>
        </div>
      </aside>
      {mobileDrawerOpen && (
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(false)}
          aria-label="Tutup menu navigasi"
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden"
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCollapsed(false);
                setMobileDrawerOpen(true);
              }}
              aria-label="Buka menu navigasi"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            {collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Perluas sidebar"
                className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:block"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-slate-100">
                  {activeTab === 'messages' ? 'Obrolan Tim' : activeTabTitle}
                </h1>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {workspace?.name || 'Ruang kerja Team-Hub'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1 text-[10px] text-emerald-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Terhubung
            </span>
            <button
              type="button"
              onClick={() => navigateToTab('inbox')}
              aria-label="Buka kotak masuk"
              className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={openProfilePage}
              aria-label="Buka profil dan pengaturan"
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-200"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={`${displayName} avatar`}
                  className="h-full w-full object-cover"
                />
              ) : (
                avatarInitial
              )}
            </button>
          </div>
        </header>

        {notice && (
          <div
            className={`flex items-start justify-between gap-3 border-b px-4 py-2.5 text-xs sm:px-7 ${
              noticeIsError
                ? 'border-red-500/20 bg-red-500/5 text-red-300'
                : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
            }`}
            role="status"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              aria-label="Tutup notifikasi"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {activeTab === 'dashboard' && (
            <section className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
              <div>
                <p className="text-sm font-medium text-indigo-300">
                  {displayRole === 'leader' ? '👑 Leader' : '👤 Member'}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
                  Selamat datang, {displayName}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Ringkasan aktivitas dan prioritas kerja {workspace?.name || 'tim Anda'}.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => navigateToTab('tasks')}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-indigo-500/40 hover:bg-slate-900/80"
                >
                  <span className="text-xs text-slate-400">Tugas Aktif</span>
                  <span className="mt-2 block text-3xl font-semibold text-indigo-300">
                    {activeTaskCount}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    To Do dan In Progress
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateToTab('history')}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-emerald-500/40 hover:bg-slate-900/80"
                >
                  <span className="text-xs text-slate-400">Tugas Selesai</span>
                  <span className="mt-2 block text-3xl font-semibold text-emerald-300">
                    {completedTaskCount}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">Lihat arsip History</span>
                </button>
                <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <span className="text-xs text-slate-400">Agenda Terdekat</span>
                  {upcomingAgendaEvents[0] ? (
                    <>
                      <span className="mt-2 block truncate text-sm font-semibold text-slate-100">
                        {upcomingAgendaEvents[0].title}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {new Date(upcomingAgendaEvents[0].start_time).toLocaleString('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-500">
                        {isOnlineEvent(upcomingAgendaEvents[0])
                          ? 'Rapat Online'
                          : upcomingAgendaEvents[0].location || 'Lokasi belum ditentukan'}
                      </span>
                      {isOnlineEvent(upcomingAgendaEvents[0]) && (
                        <a
                          href={getMeetingLink(upcomingAgendaEvents[0])}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200"
                        >
                          <Video className="h-3 w-3" />
                          Buka ruang rapat
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => navigateToTab('calendar')}
                        className="mt-2 block text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        Lihat kalender
                      </button>
                    </>
                  ) : (
                    <span className="mt-3 block text-sm text-slate-500">Belum ada agenda.</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigateToTab('docs')}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-violet-500/40 hover:bg-slate-900/80"
                >
                  <span className="text-xs text-slate-400">Total Notulensi</span>
                  <span className="mt-2 block text-3xl font-semibold text-violet-300">
                    {documents.length}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">Dokumen tersimpan</span>
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                  {isWorkspaceLeader ? (
                    <>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100">
                            Daftar Anggota Binaan
                          </h3>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Member yang dibimbing oleh Anda
                          </p>
                        </div>
                        <UserRound className="h-5 w-5 shrink-0 text-indigo-300" />
                      </div>
                      {supervisedMembers.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">
                          Belum ada Member binaan.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {supervisedMembers.map((member) => {
                            const memberDoneCount = tasks.filter(
                              (task) =>
                                task.created_by === currentUser?.id &&
                                task.status === 'done' &&
                                (task.target_type === 'personal'
                                  ? task.assignee_id === member.id
                                  : task.target_type === 'team')
                            ).length;
                            return (
                              <article
                                key={member.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium text-slate-200">
                                    {member.full_name}
                                  </p>
                                  <p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        member.status === 'Aktif bekerja'
                                          ? 'bg-emerald-400'
                                          : member.status === 'Fokus / Rapat'
                                            ? 'bg-amber-400'
                                            : 'bg-slate-500'
                                      }`}
                                    />
                                    {member.status || 'Status belum diatur'}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                                  {memberDoneCount} tugas selesai
                                </span>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Leader Pembimbing
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {mentorName || 'Belum ada Leader pembimbing yang ditetapkan.'}
                        </p>
                      </div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-xs font-medium text-slate-300">Tugas Prioritas</h4>
                        <button
                          type="button"
                          onClick={() => navigateToTab('tasks')}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200"
                        >
                          Lihat semua
                        </button>
                      </div>
                      {memberPriorityTasks.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">
                          Tidak ada tugas prioritas saat ini.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {memberPriorityTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => navigateToTab('tasks')}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-indigo-500/30"
                            >
                              <span className="min-w-0 truncate text-xs font-medium text-slate-200">
                                {task.title}
                              </span>
                              <span
                                className={`shrink-0 rounded-md px-2 py-1 text-[10px] ${
                                  task.status === 'in_progress'
                                    ? 'bg-amber-500/10 text-amber-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Pintasan Cepat</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Aksi untuk mulai bekerja</p>
                    </div>
                    <Sparkles className="h-5 w-5 text-indigo-300" />
                  </div>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={openNewTask}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3 text-left text-xs font-medium text-slate-200 transition hover:border-indigo-500/40 hover:bg-slate-800"
                    >
                      <CheckSquare className="h-4 w-4 text-indigo-300" />
                      + Buat Tugas
                    </button>
                    <button
                      type="button"
                      onClick={() => void createInstantMeeting()}
                      disabled={busy}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3 text-left text-xs font-medium text-slate-200 transition hover:border-indigo-500/40 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Video className="h-4 w-4 text-indigo-300" />
                      Mulai Rapat Video
                    </button>
                    <button
                      type="button"
                      onClick={() => void createDocument()}
                      disabled={busy}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3 text-left text-xs font-medium text-slate-200 transition hover:border-indigo-500/40 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <FileText className="h-4 w-4 text-indigo-300" />
                      Tulis Notulensi
                    </button>
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeTab === 'messages' && (
            <section className="flex h-full min-h-[400px] flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-8">
                {filteredMessages.length === 0 ? (
                  <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
                    <div className="mb-3 rounded-2xl bg-slate-900 p-4 text-slate-600">
                      <MessageSquare className="h-7 w-7" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">
                      {search ? 'Tidak ada pesan yang cocok' : 'Mulai percakapan tim'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {activeChannel
                        ? 'Kirim pesan pertama untuk memulai obrolan tim.'
                        : 'Menyiapkan ruang obrolan tim...'}
                    </p>
                  </div>
                ) : (
                  filteredMessages.map((message) => {
                    const isOwnMessage = message.sender_id === session.user.id;
                    return (
                      <article key={message.id} className="flex gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isOwnMessage
                              ? 'bg-indigo-500/20 text-indigo-200'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {(message.profiles?.full_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium text-slate-200">
                              {isOwnMessage
                                ? 'Anda'
                                : message.profiles?.full_name || 'Anggota'}
                            </span>
                            <time className="text-[10px] text-slate-600">
                              {new Date(message.created_at).toLocaleString('id-ID')}
                            </time>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                            {message.content}
                          </p>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
              <form onSubmit={handleSendMessage} className="border-t border-slate-800 p-4 sm:px-8">
                <div className="mx-auto flex max-w-5xl items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-2 focus-within:border-slate-700">
                  <textarea
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    aria-label="Tulis pesan"
                    placeholder="Tulis pesan untuk tim..."
                    className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                    disabled={!activeChannel}
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || !activeChannel}
                    aria-label="Kirim pesan"
                    className="mb-0.5 rounded-lg bg-indigo-600 p-2.5 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] text-slate-600">
                  Enter untuk mengirim · Shift + Enter untuk baris baru
                </p>
              </form>
            </section>
          )}

          {activeTab === 'meetings' && (
            <section className="mx-auto max-w-5xl space-y-7 p-5 sm:p-8">
              <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900 p-6 sm:p-9">
                <div className="relative z-10 max-w-xl">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                    <Video className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">Ruang rapat tim, siap dipakai</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                    Buat ruang Jitsi instan atau bergabung kembali ke rapat yang sedang berlangsung.
                  </p>
                  <button
                    type="button"
                    onClick={() => void createInstantMeeting()}
                    disabled={busy || !workspace}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Mulai rapat instan
                  </button>
                </div>
                <Video className="absolute -bottom-8 -right-4 h-48 w-48 text-indigo-400/[0.06]" />
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Sedang berlangsung</h2>
                    <p className="mt-1 text-xs text-slate-500">Rapat aktif dalam ruang kerja</p>
                  </div>
                  {activeMeetings.length > 0 && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300">
                      {activeMeetings.length} aktif
                    </span>
                  )}
                </div>
                {activeMeetings.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                    Belum ada rapat yang sedang berlangsung.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {activeMeetings.map((meeting) => (
                      <article
                        key={meeting.id}
                        className="rounded-xl border border-emerald-500/20 bg-slate-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-100">{meeting.title}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Berlangsung sekarang
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyMeetingLink(meeting)}
                            title="Salin link undangan"
                            aria-label="Salin link undangan"
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <a
                            href={getMeetingLink(meeting)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-xs font-medium text-white hover:bg-indigo-500"
                          >
                            Gabung rapat
                          </a>
                          <button
                            type="button"
                            onClick={() => void copyMeetingLink(meeting)}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Salin link
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-200">Rapat terjadwal</h2>
                <div className="space-y-2">
                  {upcomingEvents
                    .filter(isOnlineEvent)
                    .filter(
                      (event) =>
                        !activeMeetings.some((activeMeeting) => activeMeeting.id === event.id)
                    ).length === 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-xs text-slate-500">
                      Belum ada rapat terjadwal berikutnya.
                    </div>
                  ) : (
                    upcomingEvents
                      .filter(isOnlineEvent)
                      .filter(
                        (event) =>
                          !activeMeetings.some((activeMeeting) => activeMeeting.id === event.id)
                      )
                      .map((meeting) => (
                        <div
                          key={meeting.id}
                          className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-200">{meeting.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(meeting.start_time).toLocaleString('id-ID', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyMeetingLink(meeting)}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Salin undangan
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'calendar' && (
            <section className="mx-auto max-w-5xl p-5 sm:p-8">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Agenda ruang kerja</h2>
                  <p className="mt-1 text-xs text-slate-500">Jadwal rapat dan acara tim</p>
                </div>
              </div>
              <form
                onSubmit={handleAddEvent}
                className="mb-7 grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2"
              >
                <input
                  value={newEventTitle}
                  onChange={(event) => setNewEventTitle(event.target.value)}
                  aria-label="Nama rapat"
                  placeholder="Nama rapat atau acara"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                />
                <input
                  type="datetime-local"
                  value={newEventDate}
                  onChange={(event) => setNewEventDate(event.target.value)}
                  aria-label="Waktu rapat"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500"
                />
                <select
                  value={newEventMeetingType}
                  onChange={(event) =>
                    setNewEventMeetingType(
                      event.target.value === 'offline' ? 'offline' : 'online'
                    )
                  }
                  aria-label="Tipe rapat"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="online">Rapat Online</option>
                  <option value="offline">Rapat Offline / Tatap Muka</option>
                </select>
                {newEventMeetingType === 'offline' && (
                  <label className="block text-xs text-slate-400">
                    Tempat / Lokasi Rapat
                    <input
                      value={newEventLocation}
                      onChange={(event) => setNewEventLocation(event.target.value)}
                      aria-label="Tempat / Lokasi Rapat"
                      placeholder="Contoh: Aula Kantor"
                      required
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </label>
                )}
                <div className="flex justify-end gap-2 sm:col-span-2">
                  {editingEventId && (
                    <button
                      type="button"
                      onClick={resetEventForm}
                      disabled={busy}
                      className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={
                      busy ||
                      !newEventTitle.trim() ||
                      !newEventDate ||
                      (newEventMeetingType === 'offline' && !newEventLocation.trim())
                    }
                    className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {editingEventId ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {editingEventId ? 'Simpan Perubahan' : 'Jadwalkan'}
                  </button>
                </div>
              </form>
              <div className="space-y-3">
                {upcomingEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
                    <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                    <p className="text-sm text-slate-400">Belum ada agenda mendatang.</p>
                    <p className="mt-1 text-xs text-slate-600">Jadwalkan rapat untuk memulainya.</p>
                  </div>
                ) : (
                  upcomingEvents.map((event) => (
                    <article
                      key={event.id}
                      className="flex flex-col items-start gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row"
                    >
                      <div className="rounded-lg bg-indigo-500/10 p-2.5 text-indigo-300">
                        {event.meeting_type === 'offline' ? (
                          <MapPin className="h-5 w-5" />
                        ) : isOnlineEvent(event) ? (
                          <Video className="h-5 w-5" />
                        ) : (
                          <CalendarDays className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-slate-100">{event.title}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(event.start_time).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                        {isOnlineEvent(event) && (
                          <p className="mt-2 text-[11px] text-slate-400">Rapat Video Online</p>
                        )}
                        {event.meeting_type === 'offline' && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-300">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            Tempat: {event.location || 'Belum ditentukan'}
                          </p>
                        )}
                      </div>
                      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                        {isOnlineEvent(event) ? (
                          <a
                            href={getMeetingLink(event)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Gabung
                          </a>
                        ) : event.meeting_type === 'offline' ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200">
                            Tatap Muka / Offline
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => startEditingEvent(event)}
                          disabled={busy}
                          title="Edit agenda"
                          aria-label={`Edit agenda ${event.title}`}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteEvent(event)}
                          disabled={busy}
                          title="Hapus agenda"
                          aria-label={`Hapus agenda ${event.title}`}
                          className="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}

          {activeTab === 'tasks' && (
            <section className="mx-auto max-w-7xl p-5 sm:p-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Papan tugas</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {pendingTaskCount} tugas aktif · Pindahkan kartu untuk memperbarui status
                  </p>
                </div>
                {isWorkspaceLeader && (
                  <form
                    onSubmit={handleAddTask}
                    className="w-full space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
                  >
                    <label className="block text-xs font-medium text-slate-300">
                      Judul Tugas
                      <input
                        id="new-task-title"
                        required
                        value={newTaskTitle}
                        onChange={(event) => setNewTaskTitle(event.target.value)}
                        placeholder="Contoh: Siapkan laporan mingguan"
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-300">
                      Perintah / Instruksi Tugas
                      <textarea
                        value={newTaskDescription}
                        onChange={(event) => setNewTaskDescription(event.target.value)}
                        rows={4}
                        placeholder="Tuliskan detail arahan pekerjaan..."
                        className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-300">
                      Link Situs Referensi (Opsional)
                      <input
                        type="url"
                        value={newTaskReferenceLink}
                        onChange={(event) => setNewTaskReferenceLink(event.target.value)}
                        placeholder="https://contoh.com"
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-300">
                        Target Penerima
                        <select
                          value={taskTargetType}
                          onChange={(event) => {
                            setTaskTargetType(event.target.value as 'team' | 'personal');
                            setTaskAssigneeId('');
                          }}
                          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                        >
                          <option value="team">Seluruh Member Binaan Saya</option>
                          <option value="personal">Member Tertentu (@Nama)</option>
                        </select>
                      </label>
                      {taskTargetType === 'personal' && (
                        <label className="block text-xs font-medium text-slate-300">
                          Pilih Member
                          <select
                            value={taskAssigneeId}
                            onChange={(event) => setTaskAssigneeId(event.target.value)}
                            required
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                          >
                            <option value="">Pilih Member binaan...</option>
                            {members
                              .filter(
                                (member) =>
                                  member.leader_id === currentUser?.id &&
                                  member.role.toLowerCase() !== 'leader'
                              )
                              .map((member) => (
                                <option key={member.id} value={member.id}>
                                  @{member.full_name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-300 transition hover:border-indigo-500/60">
                        <FileUp className="h-4 w-4 text-indigo-300" />
                        {taskInstructionFile?.name || 'Upload File Tugas (Opsional)'}
                        <input
                          type="file"
                          onChange={(event) => {
                            setTaskInstructionFile(event.currentTarget.files?.[0] ?? null);
                            event.currentTarget.value = '';
                          }}
                          className="hidden"
                          aria-label="Upload file instruksi tugas"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={
                          busy ||
                          !newTaskTitle.trim() ||
                          (taskTargetType === 'personal' && !taskAssigneeId)
                        }
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Buat Tugas Baru
                      </button>
                    </div>
                  </form>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {taskColumns.map((column) => {
                  const columnTasks = filteredTasks.filter((task) => task.status === column.status);
                  return (
                    <div
                      key={column.status}
                      className="min-h-64 rounded-xl border border-slate-800 bg-slate-900/50 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${column.color}`} />
                          <h3 className="text-xs font-semibold text-slate-300">{column.label}</h3>
                          <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {columnTasks.length}
                          </span>
                        </div>
                        <MoreHorizontal className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="space-y-2">
                        {columnTasks.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-800/80 p-5 text-center text-[11px] text-slate-600">
                            Belum ada tugas
                          </div>
                        ) : (
                          columnTasks.map((task) => (
                            <article
                              key={task.id}
                              className="rounded-lg border border-slate-800 bg-slate-900 p-3.5 shadow-sm"
                            >
                              <p
                                className={`text-sm leading-5 ${
                                  task.status === 'done'
                                    ? 'text-slate-500 line-through'
                                    : 'text-slate-200'
                                }`}
                              >
                                {task.title}
                              </p>
                              <p className="mt-2 inline-flex rounded-md bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200">
                                {task.target_type === 'personal'
                                  ? `👤 Khusus: ${members.find((member) => member.id === task.assignee_id)?.full_name || 'Member'}`
                                  : '👥 Seluruh Tim Binaan'}
                              </p>
                              {task.description && (
                                <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-300">
                                  {task.description}
                                </p>
                              )}
                              {task.reference_link && (
                                <a
                                  href={task.reference_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 flex w-fit items-center gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-200 hover:bg-indigo-500/20"
                                >
                                  🔗 Buka Link Tugas
                                </a>
                              )}
                              {task.instruction_file_url && (
                                <a
                                  href={task.instruction_file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 flex w-fit items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] text-indigo-300 hover:bg-slate-800"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  📄 Unduh Dokumen Tugas
                                </a>
                              )}
                              {task.submission_file_url && (
                                <a
                                  href={task.submission_file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 flex w-fit items-center gap-1.5 rounded-md border border-emerald-500/30 px-2.5 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                                >
                                  ✅ Lihat Hasil Kerja
                                  {task.submission_file_name ? ` · ${task.submission_file_name}` : ''}
                                </a>
                              )}
                              <div className="mt-4 flex items-center justify-between">
                                <span className="flex items-center gap-1 text-[10px] text-slate-600">
                                  <UserRound className="h-3 w-3" />
                                  {task.created_by === session?.user.id
                                    ? 'Dibuat Anda'
                                    : task.target_type === 'personal'
                                      ? 'Tugas personal'
                                      : 'Tim'}
                                </span>
                                <select
                                  value={task.status}
                                  onChange={(event) =>
                                    void updateTaskStatus(
                                      task,
                                      event.target.value as Task['status']
                                    )
                                  }
                                  aria-label={`Ubah status tugas ${task.title}`}
                                  className="max-w-32 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 outline-none focus:border-indigo-500"
                                >
                                  {taskColumns.map((status) => (
                                    <option key={status.status} value={status.status}>
                                      {status.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="mt-3 flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-[11px] text-slate-300 transition hover:border-indigo-500/50 hover:text-indigo-300">
                                <Upload className="h-3.5 w-3.5" />
                                {taskUploadBusyId === task.id ? 'Mengunggah...' : '📤 Upload Hasil Kerja'}
                                <input
                                  type="file"
                                  disabled={taskUploadBusyId === task.id}
                                  onChange={(event) => {
                                    const file = event.currentTarget.files?.[0];
                                    event.currentTarget.value = '';
                                    if (file) void uploadTaskFile(task, file, 'submission');
                                  }}
                                  className="hidden"
                                  aria-label={`Upload hasil tugas ${task.title}`}
                                />
                              </label>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'docs' && (
            <section className="flex min-h-full">
              <aside
                className={`w-full shrink-0 border-r border-slate-800 bg-slate-950/50 p-4 sm:w-64 ${
                  selectedDocument ? 'hidden sm:block' : 'block'
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Daftar Notulensi
                  </p>
                  <button
                    type="button"
                    onClick={() => void createDocument()}
                    disabled={busy}
                    aria-label="Buat notulensi baru"
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {filteredDocuments.map((document) => {
                    const isSelected = selectedDocumentId === document.id;
                    return (
                      <div
                        key={document.id}
                        className={`group flex items-center rounded-lg transition ${
                          isSelected ? 'bg-slate-800' : 'hover:bg-slate-900'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectDocument(document)}
                          className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs ${
                            isSelected ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                          <span className="truncate">{document.title || 'Tanpa judul'}</span>
                        </button>
                        <div
                          className={`flex shrink-0 items-center pr-1 transition-opacity ${
                            isSelected
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => editDocument(document)}
                            title="Edit notulensi"
                            aria-label={`Edit notulensi ${document.title || 'Tanpa judul'}`}
                            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-indigo-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteDocument(document)}
                            disabled={busy}
                            title="Hapus notulensi"
                            aria-label={`Hapus notulensi ${document.title || 'Tanpa judul'}`}
                            className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredDocuments.length === 0 && (
                    <p className="px-2 py-4 text-center text-[11px] text-slate-600">
                      Belum ada notulensi
                    </p>
                  )}
                </div>
              </aside>
              <div
                className={`min-w-0 flex-1 flex-col ${
                  selectedDocument ? 'flex' : 'hidden sm:flex'
                }`}
              >
                {selectedDocument ? (
                  <>
                    <form onSubmit={handleSaveDocument} className="flex flex-col">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-8">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setSelectedDocumentId(null)}
                            className="mb-2 inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 sm:hidden"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Daftar Notulensi
                          </button>
                          <input
                            value={documentTitle}
                            onChange={(event) => setDocumentTitle(event.target.value)}
                            ref={documentTitleInputRef}
                            aria-label="Judul notulensi"
                            className="w-full bg-transparent text-base font-semibold text-slate-100 outline-none placeholder:text-slate-600"
                            placeholder="Tanpa judul"
                          />
                          <p className="mt-1 text-[10px] text-slate-600">
                            {selectedDocument.updated_at
                              ? `Diperbarui ${new Date(selectedDocument.updated_at).toLocaleString('id-ID')}`
                              : 'Notulensi kolaboratif'}
                          </p>
                        </div>
                        <button
                          type="submit"
                          disabled={busy}
                          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Simpan
                        </button>
                      </div>
                      <textarea
                        value={documentContent}
                        onChange={(event) => setDocumentContent(event.target.value)}
                        ref={documentContentInputRef}
                        aria-label="Isi notulensi"
                        placeholder="Mulai menulis notulensi tim..."
                        className="h-[45vh] min-h-96 w-full flex-none resize-y bg-slate-950 px-5 py-6 text-sm leading-7 text-slate-300 outline-none placeholder:text-slate-700 sm:px-10"
                      />
                    </form>
                    <section className="border-t border-slate-800 bg-slate-950/60 p-4 sm:p-6">
                      <div className="mb-4 flex items-center gap-2">
                        <History className="h-4 w-4 text-indigo-300" />
                        <div>
                          <h3 className="text-sm font-semibold text-slate-200">
                            Riwayat Catatan (Versi Tersimpan)
                          </h3>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Snapshot tersimpan setiap kali notulensi disimpan atau dipulihkan.
                          </p>
                        </div>
                      </div>
                      {documentRevisions.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">
                          Belum ada versi tersimpan untuk notulensi ini.
                        </div>
                      ) : (
                        <div className="grid gap-4 lg:grid-cols-[minmax(190px,0.7fr)_minmax(0,1.3fr)]">
                          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                            {documentRevisions.map((revision) => (
                              <button
                                type="button"
                                key={revision.id}
                                onClick={() => setSelectedRevisionId(revision.id)}
                                className={`w-full rounded-md px-3 py-2.5 text-left transition ${
                                  selectedRevisionId === revision.id
                                    ? 'bg-indigo-500/10 text-indigo-200'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                              >
                                <span className="block truncate text-xs font-medium">
                                  {revision.title || 'Tanpa judul'}
                                </span>
                                <time className="mt-1 block text-[10px] text-slate-600">
                                  {new Date(revision.created_at).toLocaleString('id-ID', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </time>
                              </button>
                            ))}
                          </div>
                          {selectedRevision ? (
                            <div className="flex min-w-0 flex-col rounded-lg border border-slate-800 bg-slate-900 p-4">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-200">
                                    {selectedRevision.title || 'Tanpa judul'}
                                  </p>
                                  <time className="mt-1 block text-[10px] text-slate-500">
                                    Disimpan{' '}
                                    {new Date(selectedRevision.created_at).toLocaleString('id-ID', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })}
                                  </time>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void restoreDocumentRevision(selectedRevision)}
                                  disabled={busy}
                                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Pulihkan Versi Ini
                                </button>
                              </div>
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-400">
                                {selectedRevision.content || 'Versi ini tidak berisi catatan.'}
                              </pre>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-800 p-6 text-xs text-slate-500">
                              Pilih versi untuk melihat pratinjau isinya.
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                    <div className="rounded-2xl bg-indigo-500/10 p-4 text-indigo-300">
                      <AlignLeft className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-sm font-semibold text-slate-200">
                      Ruang notulensi tim
                    </h2>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                      Buat dan simpan notulensi rapat serta catatan tim di satu tempat.
                    </p>
                    <button
                      type="button"
                      onClick={() => void createDocument()}
                      disabled={busy}
                      className="mt-5 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      Buat notulensi pertama
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'history' && (
            <section className="mx-auto max-w-6xl p-5 sm:p-8">
              <div className="mb-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-300">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">History Tim</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Arsip tugas, dokumen hasil, dan riwayat rapat workspace.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'Semua Aktivitas' },
                    { id: 'tasks', label: 'Tugas Selesai & Dokumen' },
                    { id: 'meetings', label: 'Riwayat Rapat' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setHistoryFilter(filter.id as HistoryFilter)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                        historyFilter === filter.id
                          ? 'bg-indigo-500/15 text-indigo-200'
                          : 'border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <label className="relative block min-w-0 flex-1 sm:w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="search"
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                      aria-label="Cari history berdasarkan judul atau nama anggota"
                      placeholder="Cari judul atau nama anggota..."
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={downloadHistoryCsv}
                    disabled={
                      historyFilter === 'meetings'
                        ? historyEvents.length === 0
                        : historyFilter === 'tasks'
                          ? historyTasks.length === 0
                          : historyTasks.length === 0 && historyEvents.length === 0
                    }
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    📥 Unduh Laporan (.CSV)
                  </button>
                </div>
              </div>

              {historyFilter !== 'meetings' && (
                <section className="mb-8">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-200">
                      Arsip Tugas Selesai & Dokumen
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      {historyTasks.length} tugas
                    </span>
                  </div>
                  {historyTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
                      <CheckSquare className="mx-auto mb-2 h-6 w-6 text-slate-700" />
                      <p className="text-xs text-slate-500">Tidak ada arsip tugas yang cocok.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {historyTasks.map((task) => {
                        const taskDate = getTaskHistoryDate(task);
                        const leaderName = getHistoryPersonName(
                          task.created_by,
                          members,
                          leaders,
                          currentUser?.id,
                          profile?.full_name
                        );
                        const executorName = task.assignee_id
                          ? getHistoryPersonName(
                              task.assignee_id,
                              members,
                              leaders,
                              currentUser?.id,
                              profile?.full_name
                            )
                          : 'Seluruh Tim';
                        return (
                          <article
                            key={task.id}
                            className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold text-slate-100">
                                  {task.title}
                                </h4>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-400">
                                  {task.description || 'Tidak ada detail perintah tugas.'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                                {task.status === 'done' ? 'Selesai' : 'Hasil dikirim'}
                              </span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 pt-3 text-[11px] text-slate-400">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                                Selesai:{' '}
                                {taskDate
                                  ? new Date(taskDate).toLocaleString('id-ID', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })
                                  : 'Tanggal tidak tersedia'}
                              </span>
                              <span>
                                Leader pemberi tugas: <strong className="font-medium text-slate-300">{leaderName}</strong>
                              </span>
                              <span>
                                Pelaksana: <strong className="font-medium text-slate-300">{executorName}</strong>
                              </span>
                            </div>
                            {(task.instruction_file_url || task.submission_file_url) && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {task.instruction_file_url && (
                                  <a
                                    href={task.instruction_file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={task.instruction_file_name || true}
                                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-[11px] font-medium text-indigo-200 transition hover:bg-indigo-500/20"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    📄 Dokumen Tugas (Leader)
                                  </a>
                                )}
                                {task.submission_file_url && (
                                  <a
                                    href={task.submission_file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={task.submission_file_name || true}
                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    ✅ Dokumen Hasil (Member/Leader)
                                  </a>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {historyFilter !== 'tasks' && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-200">Riwayat Rapat</h3>
                    <span className="text-[11px] text-slate-500">
                      {historyEvents.length} agenda
                    </span>
                  </div>
                  {historyEvents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
                      <CalendarDays className="mx-auto mb-2 h-6 w-6 text-slate-700" />
                      <p className="text-xs text-slate-500">Tidak ada riwayat rapat yang cocok.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {historyEvents.map((event) => {
                        const online = isOnlineEvent(event);
                        const eventType = online
                          ? 'Rapat Online'
                          : event.meeting_type === 'offline'
                            ? 'Rapat Offline'
                            : 'Agenda Tim';
                        const organizer = getHistoryPersonName(
                          event.created_by,
                          members,
                          leaders,
                          currentUser?.id,
                          profile?.full_name
                        );
                        return (
                          <article
                            key={event.id}
                            className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
                          >
                            <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                              {online ? (
                                <Video className="h-4 w-4" />
                              ) : event.meeting_type === 'offline' ? (
                                <MapPin className="h-4 w-4" />
                              ) : (
                                <CalendarDays className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-medium text-slate-100">{event.title}</h4>
                              <p className="mt-1 text-xs text-slate-400">
                                {new Date(event.start_time).toLocaleDateString('id-ID', {
                                  dateStyle: 'medium',
                                })}{' '}
                                ·{' '}
                                {new Date(event.start_time).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                –{' '}
                                {new Date(event.end_time).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    online
                                      ? 'bg-indigo-500/10 text-indigo-300'
                                      : event.meeting_type === 'offline'
                                        ? 'bg-amber-500/10 text-amber-200'
                                        : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {eventType}
                                </span>
                                {event.location && <span>Tempat: {event.location}</span>}
                                <span>Penjadwal: {organizer}</span>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </section>
          )}

          {activeTab === 'profile' && (
            <section className="mx-auto w-full max-w-3xl p-5 sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-100">Profil & Pengaturan Akun</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Perbarui informasi profil dan nama workspace Anda.
                </p>
                <span className="mt-3 inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                  {roleBadge}
                </span>
              </div>
              <form
                onSubmit={saveSettings}
                className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7"
              >
                <div>
                  <p className="mb-3 text-sm font-medium text-slate-200">Foto Profil</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-2xl font-bold text-white">
                      {settingsAvatarUrl ? (
                        <img
                          src={settingsAvatarUrl}
                          alt="Pratinjau foto profil"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        avatarInitial
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800"
                      >
                        <Upload className="h-4 w-4" />
                        Upload gambar
                      </button>
                      {settingsAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setSettingsAvatarUrl('')}
                          className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:text-red-300"
                        >
                          Hapus foto
                        </button>
                      )}
                    </div>
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                      className="hidden"
                      aria-label="Upload foto profil"
                    />
                  </div>
                  <label className="mt-4 block text-xs text-slate-400">
                    Atau gunakan URL foto
                    <input
                      type="url"
                      value={settingsAvatarUrl.startsWith('data:image/') ? '' : settingsAvatarUrl}
                      onChange={(event) => setSettingsAvatarUrl(event.target.value)}
                      placeholder="https://contoh.com/foto.jpg"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                    />
                  </label>
                  <p className="mt-1.5 text-[11px] text-slate-600">
                    Gambar yang diunggah dibatasi hingga 2 MB.
                  </p>
                </div>
                <label className="block text-xs font-medium text-slate-300">
                  Nama Lengkap
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={settingsFullName}
                    onChange={(event) => setSettingsFullName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                    placeholder="Nama Anda"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-300">
                  Peran
                  <select
                    value={settingsRole}
                    onChange={(event) => {
                      setSettingsRole(event.target.value as 'leader' | 'member');
                      if (event.target.value === 'leader') setSettingsLeaderId('');
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  >
                    <option value="leader">Leader</option>
                    <option value="member">Member</option>
                  </select>
                </label>
                {settingsRole === 'member' && (
                  <label className="block text-xs font-medium text-slate-300">
                    Leader Pembimbing
                    <select
                      required
                      value={settingsLeaderId}
                      onChange={(event) => setSettingsLeaderId(event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                    >
                      <option value="">Pilih Leader...</option>
                      {leaders.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block text-xs font-medium text-slate-300">
                  Nama Workspace
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={settingsWorkspaceName}
                    onChange={(event) => setSettingsWorkspaceName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                    placeholder="Nama workspace"
                  />
                </label>
                <div className="flex justify-end border-t border-slate-800 pt-5">
                  <button
                    type="submit"
                    disabled={
                      busy ||
                      !settingsFullName.trim() ||
                      !settingsWorkspaceName.trim() ||
                      (settingsRole === 'member' && !settingsLeaderId)
                    }
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Menyimpan...' : 'Simpan perubahan'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === 'inbox' && (
            <section className="mx-auto max-w-4xl p-5 sm:p-8">
              <div className="mb-7 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-200">Agenda Mendatang</h2>
                  <span className="text-[11px] text-slate-500">
                    {upcomingAgendaEvents.length} agenda
                  </span>
                </div>
                {upcomingAgendaEvents.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-500">
                    Belum ada jadwal mendatang.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcomingAgendaEvents.map((event) => (
                      <article
                        key={event.id}
                        className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                      >
                        <div className="mt-0.5 rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                          {isOnlineEvent(event) ? (
                            <Video className="h-4 w-4" />
                          ) : event.meeting_type === 'offline' ? (
                            <MapPin className="h-4 w-4" />
                          ) : (
                            <CalendarDays className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-200">{event.title}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Clock3 className="h-3 w-3 shrink-0" />
                            {new Date(event.start_time).toLocaleString('id-ID', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                          {isOnlineEvent(event) ? (
                            <p className="mt-1 text-[11px] text-indigo-300">Rapat Online</p>
                          ) : event.meeting_type === 'offline' ? (
                            <p className="mt-1 text-[11px] text-slate-300">
                              Rapat Offline · {event.location || 'Lokasi belum ditentukan'}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Notifikasi aktivitas tim</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {notifications.filter((notification) => !notification.is_read).length} belum dibaca
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void markAllNotificationsRead()}
                  disabled={!notifications.some((notification) => !notification.is_read)}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCheck className="h-4 w-4" />
                  Tandai semua sudah dibaca
                </button>
              </div>
              <div className="space-y-2">
                {notifications.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center">
                    <Bell className="mx-auto mb-3 h-7 w-7 text-slate-700" />
                    <p className="text-sm text-slate-400">Kotak masuk masih kosong</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Notifikasi aktivitas tim akan muncul di sini.
                    </p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <article
                      key={notification.id}
                      className={`flex items-start gap-3 rounded-xl border p-4 ${
                        notification.is_read
                          ? 'border-slate-800 bg-slate-900/60'
                          : 'border-indigo-500/20 bg-slate-900'
                      }`}
                    >
                      <div className="mt-0.5 rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {!notification.is_read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                          )}
                          <p className="text-sm font-medium text-slate-200">{notification.title}</p>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-400">
                          {notification.content}
                        </p>
                        <time className="mt-2 block text-[10px] text-slate-600">
                          {new Date(notification.created_at).toLocaleString('id-ID')}
                        </time>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteNotification(notification.id)}
                        aria-label={`Hapus notifikasi ${notification.title}`}
                        title="Hapus notifikasi"
                        className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
        {activeModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setActiveModal(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="teamhub-modal-title"
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <h2 id="teamhub-modal-title" className="text-sm font-semibold text-slate-100">
                    Pusat Bantuan
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Panduan singkat untuk bekerja dengan Team-Hub.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  aria-label="Tutup"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 p-5">
                  <div className="space-y-3">
                    <article className="flex gap-3">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <div>
                        <h3 className="text-xs font-semibold text-slate-200">Obrolan Tim</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Kirim pesan ke ruang obrolan bersama. Tekan Enter untuk mengirim dan
                          Shift + Enter untuk membuat baris baru.
                        </p>
                      </div>
                    </article>
                    <article className="flex gap-3">
                      <Video className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <div>
                        <h3 className="text-xs font-semibold text-slate-200">Rapat Video</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Mulai rapat instan atau salin link undangan Jitsi untuk dibagikan.
                        </p>
                      </div>
                    </article>
                    <article className="flex gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <div>
                        <h3 className="text-xs font-semibold text-slate-200">Kalender</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Jadwalkan rapat dan lihat agenda ruang kerja yang akan datang.
                        </p>
                      </div>
                    </article>
                    <article className="flex gap-3">
                      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <div>
                        <h3 className="text-xs font-semibold text-slate-200">Tugas</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Buat tugas lalu ubah statusnya dari To Do ke In Progress atau Done.
                        </p>
                      </div>
                    </article>
                    <article className="flex gap-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <div>
                        <h3 className="text-xs font-semibold text-slate-200">                        Notulensi</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Tulis notulensi rapat atau catatan tim, lalu simpan perubahan ke
                          workspace.
                        </p>
                      </div>
                    </article>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <span className="rounded bg-slate-800 p-1 text-slate-400">
                        <Menu className="h-3.5 w-3.5" />
                      </span>
                      Shortcut keyboard
                    </h3>
                    <dl className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-400">Fokus ke pencarian</dt>
                        <dd className="flex gap-1">
                          <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300">
                            Ctrl
                          </kbd>
                          <span className="text-slate-600">/</span>
                          <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300">
                            ⌘
                          </kbd>
                          <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300">
                            K
                          </kbd>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-400">Kirim pesan</dt>
                        <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300">
                          Enter
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-400">Baris baru dalam pesan</dt>
                        <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300">
                          Shift + Enter
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-400">Tutup dialog/menu</dt>
                        <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300">
                          Esc
                        </kbd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex justify-end border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-slate-200 hover:bg-slate-700"
                    >
                      Mengerti
                    </button>
                  </div>
                </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
