
import { useEffect, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";

import type { AppDispatch } from "../../store/store";
import { authService } from "../../services/authService";
import { websocketService } from "../../services/websocket";

import {
    setCredentials,
    clearCredentials,
} from "./authSlice";

type AuthInitializerProps = {
    children: ReactNode;
};

export function AuthInitializer({ children }: AuthInitializerProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const restoreSession = async () => {
            const userId = localStorage.getItem("userId");
            const reLoginCode = localStorage.getItem("reLoginCode");

            if (!userId || !reLoginCode) {
                dispatch(clearCredentials());
                setInitialized(true);
                return;
            }

            try {
                await websocketService.connect();

                const response = await authService.reLogin(
                    userId,
                    reLoginCode
                );

                if (
                    response.status === "success" &&
                    response.data?.RE_LOGIN_CODE
                ) {
                    dispatch(
                        setCredentials({
                            userId,
                            reLoginCode: response.data.RE_LOGIN_CODE,
                        })
                    );
                } else {
                    dispatch(clearCredentials());
                }
            } catch (error) {
                console.error("Lỗi khôi phục phiên:", error);
            } finally {
                if (!cancelled) {
                    setInitialized(true);
                }
            }
        };

        void restoreSession();

        return () => {
            cancelled = true;
        };
    }, [dispatch]);

    if (!initialized) {
        return <div>Đang khôi phục phiên đăng nhập...</div>;
    }

    return <>{children}</>;
}
