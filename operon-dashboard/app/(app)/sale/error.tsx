'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function SaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Sale page error',
      error: error.message,
      digest: error.digest,
      timestamp: new Date().toISOString(),
    }));
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-12">
      <div className="bg-red/5 border border-red/20 rounded-lg p-6 text-center space-y-3">
        <div className="text-3xl">⚠</div>
        <h2 className="text-lg font-bold text-t1">{t('error.pageError')}</h2>
        <p className="text-sm text-t3">
          {t('error.pageErrorDesc')}
        </p>
        <p className="text-xs text-t4">
          Your funds are safe. If you had a pending transaction, check your wallet or block explorer.
        </p>
        {error.digest && (
          <p className="text-xs text-t4 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <div className="flex justify-center">
        <Button variant="primary" onClick={reset}>{t('btn.tryAgain')}</Button>
      </div>
    </div>
  );
}
