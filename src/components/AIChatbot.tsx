import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, X, Send, Bot, User as UserIcon, Trash2,
  Minus, AlertCircle, RotateCw, FileText, Search, Building2, HelpCircle,
  Sparkles, Plus, History,
} from 'lucide-react';
import { apiSendMessage, apiGetConversations, apiGetConversationMessages, apiDeleteConversation,
  type ChatMessageItemDto, type ChatConversationDto } from '@/lib/api';
import { useI18n, detectTextLang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

interface ChatMsg {
  id: string;
  sender: 'user' | 'assistant';
  message: string;
  time: number;
  isError?: boolean;
}

const WELCOME_KEY = 'chat.greeting';

interface QuickAction {
  icon: typeof FileText;
  labelKey: string;
  descKey: string;
  prompt: string;
  accent: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: FileText, labelKey: 'chat.quickReport', descKey: 'chat.quickReportDesc', prompt: 'how do I file a complaint', accent: 'from-blue-500 to-blue-600' },
  { icon: Search, labelKey: 'chat.quickTrack', descKey: 'chat.quickTrackDesc', prompt: 'my complaints', accent: 'from-teal-500 to-teal-600' },
  { icon: Building2, labelKey: 'chat.quickDept', descKey: 'chat.quickDeptDesc', prompt: 'departments', accent: 'from-cyan-500 to-cyan-600' },
  { icon: HelpCircle, labelKey: 'chat.quickHow', descKey: 'chat.quickHowDesc', prompt: 'how does the complaint process work', accent: 'from-sky-500 to-sky-600' },
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AIChatbot() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([{ id: 'welcome', sender: 'assistant', message: t(WELCOME_KEY), time: Date.now() }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);
  const [conversations, setConversations] = useState<ChatConversationDto[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastFailedText = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (open && !minimized) {
      const id = setTimeout(scrollToBottom, 60);
      return () => clearTimeout(id);
    }
  }, [open, minimized, messages, loading, scrollToBottom]);

  // Verify real auth session — no fake "online" status
  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (active) setIsOnline(!!data.session);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // Update welcome message when language changes
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [{ id: 'welcome', sender: 'assistant', message: t(WELCOME_KEY), time: prev[0].time }];
      }
      return prev;
    });
  }, [lang, t]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMsg = { id: `u${Date.now()}`, sender: 'user', message: text.trim(), time: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);
    lastFailedText.current = null;

    try {
      const detectedLang = detectTextLang(text);
      const langPrefix = detectedLang === 'mr' ? '[marathi] ' : detectedLang === 'hi' ? '[hindi] ' : '';
      const reply = await apiSendMessage(langPrefix + text, conversationId);
      setConversationId(reply.conversationId);
      const aiMsg: ChatMsg = { id: `a${Date.now()}`, sender: 'assistant', message: reply.reply, time: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      lastFailedText.current = text;
      setError(e instanceof Error ? e.message : t('chat.errResponse'));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleRetry = () => {
    if (lastFailedText.current) {
      setError(null);
      setMessages((prev) => prev.filter((m) => !m.isError));
      sendMessage(lastFailedText.current);
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (loading) return;
    sendMessage(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([{ id: 'welcome', sender: 'assistant', message: t(WELCOME_KEY), time: Date.now() }]);
    setConversationId(undefined);
    setError(null);
    setShowHistory(false);
    setMinimized(false);
  };

  const loadConversations = async () => {
    try {
      const convs = await apiGetConversations();
      setConversations(convs);
      setShowHistory(true);
      setMinimized(false);
    } catch {
      setError(t('chat.errLoadConversations'));
    }
  };

  const loadConversation = async (id: number) => {
    try {
      const conv = await apiGetConversationMessages(id);
      setConversationId(conv.id);
      const loaded: ChatMsg[] = (conv.messages || []).map((m: ChatMessageItemDto) => ({
        id: `db${m.id}`,
        sender: m.sender === 'user' ? 'user' : 'assistant',
        message: m.message,
        time: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      }));
      setMessages(loaded.length > 0 ? loaded : [{ id: 'welcome', sender: 'assistant', message: t(WELCOME_KEY), time: Date.now() }]);
      setShowHistory(false);
    } catch {
      setError(t('chat.errLoadConversation'));
    }
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiDeleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        handleNewChat();
      }
    } catch {
      setError(t('chat.errDelete'));
    }
  };

  const hasOnlyWelcome = messages.length === 1 && messages[0].id === 'welcome';

  // Floating action button (closed state)
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMinimized(false); }}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3.5 bg-gradient-to-br from-blue-600 to-teal-600 text-white rounded-full shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all duration-300 hover:scale-105 group"
        aria-label={t('chat.open')}
        style={{ animation: 'fabPop 0.4s ease-out' }}
      >
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
        <Bot className="w-5 h-5" />
        <span className="text-sm font-semibold hidden sm:inline">{t('chat.title')}</span>
        <Sparkles className="w-3.5 h-3.5 text-teal-200 sm:hidden" />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col bg-white rounded-2xl shadow-2xl shadow-blue-900/20 border border-gray-200/80 w-[calc(100vw-2.5rem)] sm:w-[400px] overflow-hidden"
      style={{ animation: 'chatOpen 0.28s cubic-bezier(0.16, 1, 0.3, 1)', height: minimized ? 'auto' : undefined, maxHeight: minimized ? 'auto' : '85vh' }}
      role="dialog"
      aria-label={t('chat.title')}
    >
      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-teal-600">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-blue-600 ${isOnline ? 'bg-emerald-400' : 'bg-gray-400'}`}
              title={isOnline ? t('chat.online') : t('availability.Offline')}
            />
          </div>
          <div className="min-w-0 text-white">
            <p className="font-semibold text-sm leading-tight truncate">{t('chat.title')}</p>
            <p className="text-[11px] text-white/80 leading-tight flex items-center gap-1">
              {t('chat.subtitle')}
              {isOnline && <span className="text-emerald-200">· {t('chat.online')}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setMinimized((m) => !m)}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/15 transition-colors"
            title={t('chat.minimize')}
            aria-label={t('chat.minimize')}
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewChat}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/15 transition-colors"
            title={t('chat.newChat')}
            aria-label={t('chat.newChat')}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={loadConversations}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/15 transition-colors"
            title={t('chat.history')}
            aria-label={t('chat.history')}
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/15 transition-colors"
            title={t('chat.close')}
            aria-label={t('chat.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body — hidden when minimized */}
      {!minimized && (
        <>
          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/80" style={{ maxHeight: '70vh' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-blue-600" />
                  {t('chat.conversationHistory')}
                </p>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" />
                  {t('chat.back')}
                </button>
              </div>
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <MessageCircle className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">{t('chat.noConversations')}</p>
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200/70 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title || t('chat.untitled')}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{new Date(c.updatedAt).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title={t('chat.delete')}
                      aria-label={t('chat.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-gray-50/50 to-white" style={{ maxHeight: '52vh', minHeight: '200px' }}>
                {/* Quick actions — only show on fresh conversation */}
                {hasOnlyWelcome && !loading && (
                  <div className="grid grid-cols-2 gap-2.5" style={{ animation: 'chatFade 0.4s ease-out 0.1s both' }}>
                    {QUICK_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.labelKey}
                          onClick={() => handleQuickAction(action.prompt)}
                          disabled={loading}
                          className="group flex flex-col items-start gap-1.5 p-3 bg-white rounded-xl border border-gray-200/80 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100 transition-all text-left disabled:opacity-50"
                        >
                          <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${action.accent} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                            <Icon className="w-4 h-4 text-white" />
                          </span>
                          <span className="text-xs font-semibold text-gray-800 leading-tight">{t(action.labelKey)}</span>
                          <span className="text-[10px] text-gray-400 leading-tight">{t(action.descKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`} style={{ animation: 'chatFade 0.25s ease-out' }}>
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
                        : 'bg-gradient-to-br from-teal-500 to-teal-600 text-white'
                    }`}>
                      {msg.sender === 'user' ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`flex flex-col max-w-[78%] ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-sm shadow-sm'
                          : 'bg-white border border-gray-200/80 text-gray-700 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.message}
                      </div>
                      <span className={`text-[10px] text-gray-400 mt-1 px-1 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.time)}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-2.5" style={{ animation: 'chatFade 0.25s ease-out' }}>
                    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-white border border-gray-200/80 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-teal-400" style={{ animation: 'dotPulse 1.4s ease-in-out infinite' }} />
                        <span className="w-2 h-2 rounded-full bg-teal-400" style={{ animation: 'dotPulse 1.4s ease-in-out 0.2s infinite' }} />
                        <span className="w-2 h-2 rounded-full bg-teal-400" style={{ animation: 'dotPulse 1.4s ease-in-out 0.4s infinite' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Error with retry */}
                {error && (
                  <div className="flex flex-col items-center gap-2 py-3">
                    <div className="flex items-center gap-2 text-xs text-rose-600 px-4 py-2.5 bg-rose-50 rounded-xl border border-rose-100">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                    <button
                      onClick={handleRetry}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <RotateCw className="w-3 h-3" />
                      {t('chat.retry')}
                    </button>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-gray-200/80 px-3 py-3 bg-white">
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('chat.placeholder')}
                      rows={1}
                      className="w-full resize-none px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:bg-white transition-all max-h-24 placeholder:text-gray-400"
                      disabled={loading}
                      aria-label={t('chat.placeholder')}
                    />
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-600 to-teal-600 text-white rounded-2xl hover:shadow-lg hover:shadow-blue-600/30 disabled:opacity-40 disabled:shadow-none transition-all hover:scale-105 active:scale-95"
                    aria-label={t('chat.placeholder')}
                  >
                    {loading ? <RotateCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 text-center">{t('chat.footer')}</p>
              </div>
            </>
          )}
        </>
      )}

      {/* Minimized bar */}
      {minimized && (
        <button
          onClick={() => setMinimized(false)}
          className="px-4 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors text-left w-full flex items-center gap-2"
        >
          <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
          <span className="truncate">{hasOnlyWelcome ? t('chat.subtitle') : messages[messages.length - 1]?.message.slice(0, 50) + '…'}</span>
          <span className="ml-auto text-blue-600 font-medium">{t('chat.back')}</span>
        </button>
      )}
    </div>
  );
}
