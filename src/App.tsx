import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { KeyGate } from './components/KeyGate';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { loadCatalog } from './lib/models';
import { useSettings } from './lib/store';
import ChatPage from './pages/ChatPage';

const TranslatorPage = lazy(() => import('./pages/TranslatorPage'));
const TeacherPage = lazy(() => import('./pages/TeacherPage'));
const AccentPage = lazy(() => import('./pages/AccentPage'));
const ModelsPage = lazy(() => import('./pages/ModelsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function useTheme() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d12' : '#f6f6fa');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  useTheme();
  const apiKey = useSettings((s) => s.apiKey);
  useEffect(() => {
    loadCatalog();
  }, [apiKey]);

  return (
    <HashRouter>
      <KeyGate>
        <Layout>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner className="size-6" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to="/chat" replace />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:id" element={<ChatPage />} />
              <Route path="/translator" element={<TranslatorPage />} />
              <Route path="/learn" element={<TeacherPage />} />
              <Route path="/accent" element={<AccentPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </KeyGate>
    </HashRouter>
  );
}
