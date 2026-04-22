'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    // Report to error tracking service
    // When @sentry/nextjs is installed, it auto-instruments error boundaries.
    // For now, structured log output for Vercel Logs:
    console.error(JSON.stringify({
      level: 'error',
      message: 'Unhandled dashboard error',
      error: error.message,
      digest: error.digest,
      stack: error.stack?.slice(0, 500),
      timestamp: new Date().toISOString(),
    }));
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-4xl">&#9888;</div>
      <h2 className="text-xl font-bold text-t1">{t('error.pageError')}</h2>
      <p className="text-t3 text-sm text-center max-w-md">
        {t('error.pageErrorDesc')}
      </p>
      {error.digest && (
        <p className="text-t4 text-xs font-mono">Error ID: {error.digest}</p>
      )}
      <Button variant="primary" onClick={reset}>
        {t('btn.tryAgain')}
      </Button>
    </div>
  );
}
