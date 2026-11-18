import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/api';

export function App() {
  const [info, setInfo] = useState<AppInfo>();

  useEffect(() => {
    void window.api.appInfo().then(setInfo);
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>E-Invoice Desktop</h1>
      <p>{info ? `${info.name} ${info.version}` : '…'}</p>
    </main>
  );
}
