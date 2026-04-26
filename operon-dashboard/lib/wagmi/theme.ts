import { type Theme } from '@rainbow-me/rainbowkit';

// Matches website prototype-O: navy/purple gradient CTA, ice-blue accents,
// dark-navy modal surfaces with blue borders. Green is reserved for
// status (connectionIndicator only).
export const operonRainbowTheme: Theme = {
  blurs: {
    modalOverlay: 'blur(8px)',
  },
  colors: {
    accentColor: '#3B82F6',
    accentColorForeground: '#FFFFFF',
    actionButtonBorder: 'rgba(147, 197, 253, 0.18)',
    actionButtonBorderMobile: 'rgba(147, 197, 253, 0.18)',
    actionButtonSecondaryBackground: 'rgba(8, 12, 24, 0.7)',
    closeButton: 'rgba(170, 188, 220, 0.55)',
    closeButtonBackground: 'rgba(147, 197, 253, 0.06)',
    connectButtonBackground: '#2d2496',
    connectButtonBackgroundError: '#EF4444',
    connectButtonInnerBackground: 'rgba(8, 12, 24, 0.85)',
    connectButtonText: '#FFFFFF',
    connectButtonTextError: '#FFFFFF',
    connectionIndicator: '#4ecb8d',
    downloadBottomCardBackground: '#02050d',
    downloadTopCardBackground: '#0a1226',
    error: '#EF4444',
    generalBorder: 'rgba(147, 197, 253, 0.18)',
    generalBorderDim: 'rgba(147, 197, 253, 0.08)',
    menuItemBackground: 'rgba(8, 12, 24, 0.7)',
    modalBackdrop: 'rgba(2, 5, 13, 0.72)',
    modalBackground: '#0a1226',
    modalBorder: 'rgba(147, 197, 253, 0.16)',
    modalText: '#f6f8ff',
    modalTextDim: 'rgba(170, 188, 220, 0.55)',
    modalTextSecondary: 'rgba(220, 232, 252, 0.78)',
    profileAction: 'rgba(8, 12, 24, 0.7)',
    profileActionHover: 'rgba(59, 130, 246, 0.15)',
    profileForeground: '#02050d',
    selectedOptionBorder: '#3B82F6',
    standby: '#F59E0B',
  },
  fonts: {
    body: 'Inter, system-ui, sans-serif',
  },
  radii: {
    actionButton: '100px',
    connectButton: '100px',
    menuButton: '12px',
    modal: '16px',
    modalMobile: '16px',
  },
  shadows: {
    connectButton:
      '0 10px 26px -3px rgba(45, 36, 150, 0.45), 0 0 26px -4px rgba(74, 58, 204, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
    dialog: '0 30px 80px rgba(2, 5, 13, 0.7), 0 0 60px rgba(59, 130, 246, 0.18)',
    profileDetailsAction: '0 2px 6px rgba(2, 5, 13, 0.4)',
    selectedOption: '0 0 0 2px #3B82F6',
    selectedWallet: '0 0 0 2px #3B82F6',
    walletLogo: '0 2px 8px rgba(2, 5, 13, 0.4)',
  },
};
