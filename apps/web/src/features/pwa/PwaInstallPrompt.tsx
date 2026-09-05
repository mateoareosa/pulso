import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !deferredPrompt) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      aria-label="Instalar aplicación en este dispositivo como PWA"
      style={{
        padding: '4px 10px',
        backgroundColor: 'var(--color-pulse-solid)',
        color: '#0f172a',
        border: '1px solid var(--color-ribbon-border)',
        borderRadius: 'var(--radius-xs)',
        fontWeight: 800,
        fontSize: 'var(--text-xs)',
        cursor: 'pointer',
        boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        minHeight: '30px',
      }}
      title="Instalar aplicación en tu dispositivo como PWA"
    >
      <span>INSTALAR APP</span>
    </button>
  );
};
