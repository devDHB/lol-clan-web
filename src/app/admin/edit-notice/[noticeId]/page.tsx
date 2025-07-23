'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { app } from '@/firebase';

interface NoticeData {
    title: string;
    content: string;
    imageUrls?: string[]; // imageUrl -> imageUrls
}

export default function EditNoticePage() {
    const { user } = useAuth();
    const router = useRouter();
    const params = useParams();
    const noticeId = params.noticeId as string;

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]); // string | undefined -> string[]
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (noticeId) {
            const fetchNoticeData = async () => {
                try {
                    const res = await fetch(`/api/notices/${noticeId}`);
                    if (!res.ok) throw new Error('Failed to fetch notice data');
                    const data: NoticeData = await res.json();
                    setTitle(data.title);
                    setContent(data.content);
                    setExistingImageUrls(data.imageUrls || []);
                } catch (error) {
                    console.error(error);
                    alert('공지사항 정보를 불러오는 데 실패했습니다.');
                    router.push('/notices');
                } finally {
                    setLoading(false);
                }
            };
            fetchNoticeData();
        }
    }, [noticeId, router]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            if ((existingImageUrls.length + files.length) > 10) {
                alert('이미지는 최대 10개까지 첨부할 수 있습니다.');
                e.target.value = '';
                return;
            }
            setImageFiles(files);
        }
    };

    const handleRemoveExistingImage = (urlToRemove: string) => {
        setExistingImageUrls(prev => prev.filter(url => url !== urlToRemove));
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim() || !user) return;
        setIsSubmitting(true);

        try {
            const storage = getStorage(app);
            const newImageUrls = await Promise.all(
                imageFiles.map(async (file) => {
                    const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
                    const snapshot = await uploadBytes(storageRef, file);
                    return await getDownloadURL(snapshot.ref);
                })
            );

            const finalImageUrls = [...existingImageUrls, ...newImageUrls];

            const res = await fetch(`/api/notices/${noticeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    content,
                    userEmail: user.email,
                    imageUrls: finalImageUrls, // imageUrl -> imageUrls
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '공지 수정 실패');
            }

            alert('공지사항이 성공적으로 수정되었습니다.');
            router.push(`/notices/${noticeId}`);

        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>;
    }

    return (
        <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
            <h1 className="text-4xl font-bold mb-6 text-blue-400">공지사항 수정</h1>
            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-lg space-y-6">
                <div>
                    <label htmlFor="title">제목</label>
                    <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label htmlFor="content">내용</label>
                    <textarea id="content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label htmlFor="image">이미지 첨부 (최대 10개)</label>
                    {/* 기존 이미지 미리보기 및 삭제 버튼 */}
                    <div className="flex flex-wrap gap-2 my-2">
                        {existingImageUrls.map((url, index) => (
                            <div key={index} className="relative">
                                <img src={url} alt={`기존 이미지 ${index + 1}`} className="w-24 h-24 object-cover rounded-md" />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveExistingImage(url)}
                                    className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                                >
                                    X
                                </button>
                            </div>
                        ))}
                    </div>
                    <input
                        id="image"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0" />
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 rounded-md">
                    {isSubmitting ? '수정 중...' : '수정 완료'}
                </button>
            </form>
        </main>
    );
}
