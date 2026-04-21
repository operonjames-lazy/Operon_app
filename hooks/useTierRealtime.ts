'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowser } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribes to Supabase Realtime for instant tier-sellout notifications.
 * Falls back to TanStack Query's 10s polling if Realtime disconnects.
 */

interface TierChangeEvent {
  tier: number;
  sold: number;
  supply: number;
  isActive: boolean;
  message: string;
}

export function useTierRealtime() {
  const queryClient = useQueryClient();
  const [lastEvent, setLastEvent] = useState<TierChangeEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // R14 (2026-04-22): track previous subscribe state so we can tell the
  // difference between the first SUBSCRIBED (initial connect — data already
  // loaded by TanStack Query) and a re-SUBSCRIBED after a drop (any UPDATE
  // fired during the gap was not delivered — reconcile by invalidating).
  const priorStatusRef = useRef<string | null>(null);

  const dismissEvent = useCallback(() => setLastEvent(null), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    let cancelled = false;

    try {
      const supabase = getSupabaseBrowser();

      // Build channel with all listeners BEFORE subscribing
      const channel = supabase.channel('sale-realtime');

      // Listen for tier updates
      channel.on(
        'postgres_changes' as never,
        { event: 'UPDATE', schema: 'public', table: 'sale_tiers' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (cancelled) return;
          const row = payload.new as {
            tier: number;
            total_sold: number;
            total_supply: number;
            is_active: boolean;
          };

          if (row.total_sold >= row.total_supply && payload.old?.is_active) {
            setLastEvent({
              tier: row.tier,
              sold: row.total_sold,
              supply: row.total_supply,
              isActive: false,
              message: '', // formatted by consumer via t()
            });
          }

          if (row.is_active && !payload.old?.is_active) {
            setLastEvent({
              tier: row.tier,
              sold: row.total_sold,
              supply: row.total_supply,
              isActive: true,
              message: '', // formatted by consumer via t()
            });
          }

          queryClient.invalidateQueries({ queryKey: ['sale'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }
      );

      // Listen for sale config changes
      channel.on(
        'postgres_changes' as never,
        { event: 'UPDATE', schema: 'public', table: 'sale_config' },
        () => {
          if (cancelled) return;
          queryClient.invalidateQueries({ queryKey: ['sale'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }
      );

      // NOW subscribe (after all .on() calls)
      channel.subscribe((status: string) => {
        if (cancelled) return;
        setConnected(status === 'SUBSCRIBED');
        // R14: on any transition BACK to SUBSCRIBED from a non-SUBSCRIBED
        // state, assume we missed UPDATEs on sale_tiers / sale_config during
        // the gap. TanStack Query invalidation re-fetches from the DB, which
        // is authoritative. The very first subscribe (priorStatusRef=null)
        // is the initial connect — data already loaded on mount, no action.
        const prior = priorStatusRef.current;
        if (status === 'SUBSCRIBED' && prior !== null && prior !== 'SUBSCRIBED') {
          queryClient.invalidateQueries({ queryKey: ['sale'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }
        priorStatusRef.current = status;
      });

      channelRef.current = channel;
    } catch (err) {
      console.error('Realtime subscription failed:', err);
      setConnected(false);
    }

    return () => {
      cancelled = true;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  return { lastEvent, dismissEvent, connected };
}
