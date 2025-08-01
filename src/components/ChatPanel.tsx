'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { db, rtdb } from '@/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, limit } from 'firebase/firestore';
import { ref, onValue, onDisconnect, set } from "firebase/database";

// --- 타입 정의 ---
interface Message {
    id: string;
    uid: string;
    nickname: string;
    text: string;
    createdAt: Date;
}

interface OnlineUser {
    uid: string;
    nickname: string;
    state: 'online' | 'offline';
}

interface ChatUserProfile {
    nickname: string;
    role: string;
}

export default function ChatPanel() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<ChatUserProfile | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 메시지 자동 스크롤
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // user 정보가 확인되면, 해당 유저의 프로필(닉네임)을 가져옵니다.
    useEffect(() => {
        if (user && user.email) {
            const fetchProfile = async () => {
                try {
                    const res = await fetch(`/api/users/${user.email}`);
                    if (res.ok) {
                        const data = await res.json();
                        setProfile(data);
                    }
                } catch (error) {
                    console.error("Failed to fetch profile for chat:", error);
                }
            };
            fetchProfile();
        }
    }, [user]);

    // 실시간 채팅 메시지 구독 (Firestore)
    useEffect(() => {
        const q = query(collection(db, "chatMessages"), orderBy("createdAt", "desc"), limit(50));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const msgs: Message[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                msgs.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate()
                } as Message);
            });
            setMessages(msgs.reverse());
        });

        return () => unsubscribe();
    }, []);

    // 실시간 접속자 상태 관리 (Realtime Database)
    useEffect(() => {
        if (!user || !profile) return;

        const myStatusRef = ref(rtdb, 'status/' + user.uid);
        const userStatus: OnlineUser = {
            uid: user.uid,
            nickname: profile.nickname,
            state: 'online',
        };

        onDisconnect(myStatusRef).set({ ...userStatus, state: 'offline' });
        set(myStatusRef, userStatus);

        const statusRef = ref(rtdb, 'status');
        const unsubscribe = onValue(statusRef, (snapshot) => {
            const statuses = snapshot.val();
            const online: OnlineUser[] = [];
            if (statuses) {
                for (const uid in statuses) {
                    if (statuses[uid].state === 'online') {
                        online.push(statuses[uid]);
                    }
                }
            }
            setOnlineUsers(online);
        });

        return () => unsubscribe();

    }, [user, profile]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !profile) return;

        await addDoc(collection(db, "chatMessages"), {
            uid: user.uid,
            nickname: profile.nickname,
            text: newMessage,
            createdAt: serverTimestamp(),
        });
        setNewMessage('');
    };

    return (
        <aside className="hidden lg:flex w-72 flex-shrink-0 border-l border-gray-700 bg-gray-800 flex-col">
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-bold text-white">접속자 ({onlineUsers.length})</h2>
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {onlineUsers.map(u => (
                        <li key={u.uid} className="text-sm text-green-400 truncate">
                            <span className="mr-2">●</span>{u.nickname}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <h2 className="text-lg font-bold text-white mb-2">채팅</h2>
                <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                    {messages.map(msg => (
                        <div key={msg.id} className="text-sm">
                            <span className="font-bold text-yellow-400 mr-2">{msg.nickname}:</span>
                            <span className="text-gray-200 break-words">{msg.text}</span>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="p-4 border-t border-gray-700">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="메시지 입력..."
                        className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">전송</button>
                </form>
            </div>
        </aside>
    );
}
