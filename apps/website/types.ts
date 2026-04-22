
// Fix: Added React import to provide the React namespace for ReactNode
import React from 'react';

export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export interface RoadmapItem {
  phase: string;
  title: string;
  status: 'completed' | 'current' | 'future';
  items: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
