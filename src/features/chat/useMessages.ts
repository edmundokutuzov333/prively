import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireSupabase } from '@/lib/supabase';

export type ChatAttachment = {
  id: string;
  message_id: string | null;
  conversation_id: string;
  owner_id: string;
  storage_path: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  mime_type: string;
  file_size: number;
  status: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'gift' | 'tip' | 'system';
  body: string | null;
  price: number | null;
  locked_content_id: string | null;
  created_at: string;
  read_at: string | null;
  updated_at: string;
  locked_body?: string | null;
  attachments?: ChatAttachment[];
};

export function useMessages(conversationId: string) {
  const supabase = requireSupabase();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['phase7', 'messages', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id,conversation_id,sender_id,kind,body,price,locked_content_id,created_at,read_at,updated_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(300);
      if (error) throw new Error(error.code ?? error.message);

      const messages = (data ?? []) as ChatMessage[];
      const lockedIds = messages
        .filter((message) => message.locked_content_id)
        .map((message) => message.locked_content_id as string);

      let lockedBodies: Record<string, string> = {};
      if (lockedIds.length) {
        const { data: lockedRows } = await supabase
          .from('message_locked_content')
          .select('message_id,body')
          .in('message_id', lockedIds);
        lockedBodies = Object.fromEntries(
          (lockedRows ?? []).map((row) => [row.message_id as string, row.body as string]),
        );
      }

      const { data: attachmentRows } = await supabase
        .from('message_attachments')
        .select('id,message_id,conversation_id,owner_id,storage_path,kind,mime_type,file_size,status')
        .eq('conversation_id', conversationId)
        .eq('status', 'attached');

      const attachments = (attachmentRows ?? []) as ChatAttachment[];
      return messages.map((message) => ({
        ...message,
        locked_body: message.locked_content_id ? lockedBodies[message.locked_content_id] ?? null : null,
        attachments: attachments.filter((attachment) => attachment.message_id === message.id),
      }));
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel: RealtimeChannel = supabase
      .channel('conv:' + conversationId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + conversationId },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['phase7', 'messages', conversationId] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + conversationId },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['phase7', 'messages', conversationId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, supabase]);

  return useMemo(() => query, [query]);
}

export function useConversationPresence(conversationId: string, userId: string | null) {
  const supabase = requireSupabase();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId || !userId) return;
    const channel = supabase.channel('typing:' + conversationId, {
      config: {
        private: true,
        presence: { key: userId },
      },
    });

    const refresh = () => {
      const state = channel.presenceState<{ userId: string; typing?: boolean }>();
      const users = Object.values(state)
        .flat()
        .filter((entry) => entry.userId !== userId && entry.typing)
        .map((entry) => entry.userId);
      setTypingUsers([...new Set(users)]);
    };

    channel.on('presence', { event: 'sync' }, refresh);
    channel.on('presence', { event: 'join' }, refresh);
    channel.on('presence', { event: 'leave' }, refresh);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void channel.track({ userId, typing: false });
    });

    (window as Window & { __privelyPresenceChannels?: Record<string, RealtimeChannel> }).__privelyPresenceChannels ??= {};
    (window as Window & { __privelyPresenceChannels?: Record<string, RealtimeChannel> }).__privelyPresenceChannels![conversationId] = channel;

    return () => {
      delete (window as Window & { __privelyPresenceChannels?: Record<string, RealtimeChannel> }).__privelyPresenceChannels?.[conversationId];
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, userId]);

  return {
    typingUsers,
    setTyping: (typing: boolean) => {
      if (!conversationId || !userId) return;
      const channel = (window as Window & { __privelyPresenceChannels?: Record<string, RealtimeChannel> }).__privelyPresenceChannels?.[conversationId];
      if (channel) void channel.track({ userId, typing });
    },
  };
}
