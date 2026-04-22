import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Chain } from '@/types/api';

interface ChainState {
  selectedChain: Chain;
  setChain: (chain: Chain) => void;
}

export const useChainStore = create<ChainState>()(
  persist(
    (set) => ({
      selectedChain: 'arbitrum',
      setChain: (chain) => set({ selectedChain: chain }),
    }),
    {
      name: 'operon-chain',
    },
  ),
);
