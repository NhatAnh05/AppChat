import { useEffect, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store/store';
import { restoreLoginSession } from '../../services/loginService.ts';
import { clearCredentials, setCredentials } from './authSlice';

export function AuthInitializer({children}: {children: ReactNode}) {
    const dispatch = useDispatch<AppDispatch>();
    const [initialized, setInitialized] = useState(false);
    useEffect(() => {
        // Remove credentials persisted by the broken, earlier AppChat authSlice.
        // Current sessions use sessionStorage and are never restored from localStorage.
        try { localStorage.removeItem('reLoginCode'); localStorage.removeItem('userId'); } catch { /* blocked storage */ }
        let cancelled = false;
        void restoreLoginSession().then(session => {
            if (cancelled) return;
            if (session) dispatch(setCredentials({userId:session.username}));
            else dispatch(clearCredentials());
        }).catch(() => { if (!cancelled) dispatch(clearCredentials()); })
            .finally(() => { if (!cancelled) setInitialized(true); });
        return () => { cancelled = true; };
    }, [dispatch]);
    return initialized ? <>{children}</> : <div>Đang khôi phục phiên đăng nhập...</div>;
}
