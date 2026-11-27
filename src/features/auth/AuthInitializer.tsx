import { useEffect, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store/store';
import { restoreLoginSession } from '../../services/loginService.ts';
import { readLoginSession } from '../../services/sessionStore.ts';
import { clearCredentials, setCredentials } from './authSlice';

export function AuthInitializer({children}: {children: ReactNode}) {
    const dispatch = useDispatch<AppDispatch>();
    const [initialized, setInitialized] = useState(false);
    useEffect(() => {
        // Remove credentials persisted by the old, insecure AppChat authSlice.
        try { localStorage.removeItem('reLoginCode'); localStorage.removeItem('userId'); } catch { /* blocked storage */ }
        const savedSession = readLoginSession();
        if (savedSession) {
            // Keep the chat visible during temporary outages after F5.
            // Every server operation still requires a successfully authenticated socket.
            dispatch(setCredentials({ userId: savedSession.username }));
            void restoreLoginSession().catch(() => {
                // The connection service manages offline / signed-out states.
                // A transient network error must not clear Redux credentials.
            });
        } else {
            dispatch(clearCredentials());
        }
        setInitialized(true);
    }, [dispatch]);
    return initialized ? <>{children}</> : <div>Đang khôi phục phiên đăng nhập...</div>;
}
