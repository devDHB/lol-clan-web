'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import Image from 'next/image';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from '@/firebase';

// --- 타입 정의 ---
interface UserProfile {
  role: string;
}

interface UploadedImage {
  file: File;
  previewUrl: string;
}

export default function WriteNoticePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const res = await fetch(`/api/users/${user.email}`);
          if (!res.ok) throw new Error('Failed to fetch user profile');
          const data: UserProfile = await res.json();
          setProfile(data);
          if (data.role !== '총관리자' && data.role !== '관리자') {
            alert('권한이 없습니다.');
            router.push('/');
          }
        } catch (error) {
          console.error(error);
          router.push('/');
        } finally {
          setLoading(false);
        }
      } else if (user === null) {
        router.push('/login');
      }
    };
    checkAdmin();
  }, [user, router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (images.length + files.length > 10) {
        alert('이미지는 최대 10개까지 업로드할 수 있습니다.');
        return;
      }

      const newImages: UploadedImage[] = files.map(file => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      setImages(prev => [...prev, ...newImages]);
      e.target.value = '';
    }
  };

  const handleSelectImage = (previewUrl: string) => {
    setSelectedImages(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(previewUrl)) {
        newSelection.delete(previewUrl);
      } else {
        newSelection.add(previewUrl);
      }
      return newSelection;
    });
  };

  const handleDeleteImages = () => {
    if (selectedImages.size === 0) return;
    if (confirm(`${selectedImages.size}개의 이미지를 삭제하시겠습니까?`)) {
      setImages(prev => prev.filter(img => !selectedImages.has(img.previewUrl)));
      setSelectedImages(new Set());
    }
  };

  const handleInsertImages = () => {
    if (selectedImages.size === 0) return;
    const textarea = contentRef.current;
    if (!textarea) return;

    let markdownToInsert = '';
    images.forEach(img => {
      if (selectedImages.has(img.previewUrl)) {
        markdownToInsert += `\n![${img.file.name}](이미지)\n`;
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
    if (!title.trim() || !content.trim() || !user) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      const storage = getStorage(app);
      const imageUrls = await Promise.all(
        images.map(async (image) => {
          const storageRef = ref(storage, `notices/${Date.now()}_${image.file.name}`);
          const snapshot = await uploadBytes(storageRef, image.file);
          return await getDownloadURL(snapshot.ref);
        })
      );

      let finalContent = content;
      images.forEach((img, index) => {
        const placeholder = `![${img.file.name}](이미지)`;
        const finalMarkdown = `![image](${imageUrls[index]})`;
        finalContent = finalContent.replace(placeholder, finalMarkdown);
      });

      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: finalContent,
          authorEmail: user.email,
          imageUrls,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '공지사항 작성 실패');
      }
      alert('공지사항이 성공적으로 작성되었습니다.');
      router.push('/notices');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !profile || (profile.role !== '총관리자' && profile.role !== '관리자')) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">권한을 확인 중입니다...</main>;
  }

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* ✅ [수정] 헤더 배경 박스 제거 */}
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-blue-400">공지사항 글쓰기</h1>
          <Link href="/notices" className="text-blue-400 hover:underline">← 목록으로 돌아가기</Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg space-y-6">
          <div>
            <label htmlFor="title" className="block text-lg font-semibold mb-2">제목</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              // ✅ [수정] placeholder 제거
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="content" className="block text-lg font-semibold mb-2">내용</label>
            <textarea
              id="content"
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={15}
              // ✅ [수정] placeholder 제거
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-lg font-semibold mb-2">이미지 관리 ({images.length} / 10)</label>
            <div className="p-4 bg-gray-700/50 rounded-md border border-gray-600">
              <div className="mb-4 flex flex-wrap gap-4">
                <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                  <span>이미지 업로드</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageChange} disabled={isUploading} />
                </label>
                <button type="button" onClick={handleInsertImages} className="py-2 px-4 bg-green-600 hover:bg-green-700 rounded-md font-semibold disabled:opacity-50" disabled={selectedImages.size === 0}>선택 이미지 본문 삽입</button>
                <button type="button" onClick={handleDeleteImages} className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-md font-semibold disabled:opacity-50" disabled={selectedImages.size === 0}>선택 이미지 삭제</button>
              </div>

              {isUploading && <p className="text-center text-gray-400">이미지 처리 중...</p>}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {images.map((image) => (
                  <div key={image.previewUrl} className="relative group aspect-square">
                    <Image src={image.previewUrl} alt={image.file.name} layout="fill" objectFit="cover" className="rounded-md" />
                    <div className={`absolute inset-0 bg-black transition-opacity rounded-md ${selectedImages.has(image.previewUrl) ? 'bg-opacity-50 border-4 border-blue-500' : 'bg-opacity-0 group-hover:bg-opacity-30'}`}>
                      <input
                        type="checkbox"
                        checked={selectedImages.has(image.previewUrl)}
                        onChange={() => handleSelectImage(image.previewUrl)}
                        className="absolute top-2 left-2 h-5 w-5 cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            {/* 취소 버튼 */}
            <button
              type="button"
              onClick={() => router.push('/notices')}
              className="py-2 px-8 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-8 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-wait transition-colors"
            >
              {isSubmitting ? '작성 중...' : '공지사항 작성 완료'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
