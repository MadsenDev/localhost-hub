interface ScanStatusBannerProps {
  scanDirectories: string[] | null;
  scanError: string | null;
}

export function ScanStatusBanner({ scanDirectories, scanError }: ScanStatusBannerProps) {
  if (scanDirectories === null && !scanError) {
    return (
      <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-4 text-sm text-indigo-700 dark:text-indigo-100">
        Add directories to scan so Localhost Hub knows where to discover projects.
      </div>
    );
  }

  return (
    <>
      {scanDirectories === null && scanError && (
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-4 text-sm text-indigo-700 dark:text-indigo-100">
          Add directories to scan so Localhost Hub knows where to discover projects.
        </div>
      )}
      {scanError && (
        <div className="rounded-xl border border-rose-500/60 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-200">
          {scanError}
        </div>
      )}
    </>
  );
}

export default ScanStatusBanner;

