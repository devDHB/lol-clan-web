'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { app } from '@/firebase';
import Link from 'next/link';
import Image from 'next/image';

// --- 타입 정의 ---
interface NoticeData {
    title: string;
    content: string;
    imageUrls?: string[];
}

interface ManagedImage {
    id: string;
    url: string;
    file?: File;
    isNew: boolean;
}

export default function EditNoticePage() {
    const { user } = useAuth();
    const router = useRouter();
    const params = useParams();
    const noticeId = params.noticeId as string;

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [images, setImages] = useState<ManagedImage[]>([]);
    const [imagesToDelete, setImagesToDelete] = useState<Set<string>>(new Set());
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    const contentRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (noticeId) {
            const fetchNoticeData = async () => {
                try {
                    const res = await fetch(`/api/notices/${noticeId}`);
                    if (!res.ok) throw new Error('Failed to fetch notice data');
                    const data: NoticeData = await res.json();
                    setTitle(data.title);
                    setContent(data.content);
                    const existingImages = (data.imageUrls || []).map(url => ({
                        id: url,
                        url: url,
                        isNew: false
                    }));
                    setImages(existingImages);
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
            if (images.length + files.length > 10) {
                alert('이미지는 최대 10개까지 첨부할 수 있습니다.');
                return;
            }
            const newImages: ManagedImage[] = files.map(file => {
                const previewUrl = URL.createObjectURL(file);
                return {
                    id: previewUrl,
                    url: previewUrl,
                    file: file,
                    isNew: true,
                };
            });
            setImages(prev => [...prev, ...newImages]);
            e.target.value = '';
        }
    };

    const handleSelectImage = (id: string) => {
        setSelectedImages(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(id)) {
                newSelection.delete(id);
            } else {
                newSelection.add(id);
            }
            return newSelection;
        });
    };

    const handleDeleteImages = () => {
        if (selectedImages.size === 0) return;
        if (confirm(`${selectedImages.size}개의 이미지를 삭제하시겠습니까?`)) {
            const newImagesToDelete = new Set(imagesToDelete);
            images.forEach(img => {
                if (selectedImages.has(img.id) && !img.isNew) {
                    newImagesToDelete.add(img.url);
                }
            });
            setImagesToDelete(newImagesToDelete);
            setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
            setSelectedImages(new Set());
        }
    };

    const handleInsertImages = () => {
        if (selectedImages.size === 0) return;
        const textarea = contentRef.current;
        if (!textarea) return;

        let markdownToInsert = '';
        images.forEach(img => {
            if (selectedImages.has(img.id)) {
                markdownToInsert += `\n![image](${img.url})\n`;
            }
        });

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = content.substring(0, start) + markdownToInsert + content.substring(end);

        setContent(newContent);
        setSelectedImages(new Set());
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim() || !user) return;
        setIsSubmitting(true);

        try {
            const storage = getStorage(app);

            await Promise.all(
                Array.from(imagesToDelete).map(url => {
                    const imageRef = ref(storage, url);
                    return deleteObject(imageRef);
                })
            );

            const uploadedUrls = await Promise.all(
                images.filter(img => img.isNew && img.file).map(async (image) => {
                    const storageRef = ref(storage, `notices/${Date.now()}_${image.file!.name}`);
                    const snapshot = await uploadBytes(storageRef, image.file!);
                    const downloadURL = await getDownloadURL(snapshot.ref);
                    return { previewUrl: image.url, finalUrl: downloadURL };
                })
            );

            const finalImageUrls = images
                .filter(img => !img.isNew)
                .map(img => img.url)
                .concat(uploadedUrls.map(u => u.finalUrl));

            let finalContent = content;
            uploadedUrls.forEach(urlPair => {
                const placeholder = `![image](${urlPair.previewUrl})`;
                const finalMarkdown = `![image](${urlPair.finalUrl})`;
                finalContent = finalContent.replaceAll(placeholder, finalMarkdown);
            });

            const res = await fetch(`/api/notices/${noticeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    content: finalContent,
                    userEmail: user.email,
                    imageUrls: finalImageUrls,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '공지 수정 실패');
            }

            alert('공지사항이 성공적으로 수정되었습니다.');
            router.push(`/notices/${noticeId}`);

        } catch (error: unknown) {
            if (error instanceof Error) {
                alert(error.message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>;
    }

    return (
        <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-blue-400">공지사항 수정</h1>
                    <Link href="/notices" className="text-blue-400 hover:underline">← 목록으로 돌아가기</Link>
                </div>

                <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg space-y-6">
                    <div>
                        <label htmlFor="title" className="block text-lg font-semibold mb-2">제목</label>
                        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-4 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                        <label htmlFor="content" className="block text-lg font-semibold mb-2">내용</label>
                        <textarea id="content" ref={contentRef} rows={15} value={content} onChange={(e) => setContent(e.target.value)} required className="w-full px-4 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>

                    <div>
                        <label className="block text-lg font-semibold mb-2">이미지 관리 ({images.length} / 10)</label>
                        <div className="p-4 bg-gray-700/50 rounded-md border border-gray-600">
                            <div className="mb-4 flex flex-wrap gap-4">
                                <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                                    <span>이미지 추가</span>
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageChange} />
                                </label>
                                <button type="button" onClick={handleInsertImages} className="py-2 px-4 bg-green-600 hover:bg-green-700 rounded-md font-semibold disabled:opacity-50" disabled={selectedImages.size === 0}>선택 이미지 본문 삽입</button>
                                <button type="button" onClick={handleDeleteImages} className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-md font-semibold disabled:opacity-50" disabled={selectedImages.size === 0}>선택 이미지 삭제</button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                {images.map((image) => (
                                    <div key={image.id} className="relative group aspect-square">
                                        <Image src={image.url} alt="업로드 이미지" layout="fill" objectFit="cover" className="rounded-md" />
                                        <div className={`absolute inset-0 bg-black transition-opacity rounded-md ${selectedImages.has(image.id) ? 'bg-opacity-50 border-4 border-blue-500' : 'bg-opacity-0 group-hover:bg-opacity-30'}`}>
                                            <input
                                                type="checkbox"
                                                checked={selectedImages.has(image.id)}
                                                onChange={() => handleSelectImage(image.id)}
                                                className="absolute top-2 left-2 h-5 w-5 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button
                            type="button"
                            onClick={() => router.push(`/notices/${noticeId}`)}
                            className="py-2 px-8 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                        >
                            취소
                        </button>
                        <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto py-2 px-8 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-wait">
                            {isSubmitting ? '수정 중...' : '수정 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}
