import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPostData } from '@/lib/blogData';

// 동적 메타데이터 생성 (SEO)
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = getPostData(params.slug);
  
  if (!post) {
    return {
      title: 'Post Not Found | Korean Resume AI',
    };
  }

  return {
    title: `${post.title} | Korean Resume AI`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
    },
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPostData(params.slug);

  if (!post) {
    notFound();
  }

  // 본문을 적절히 분할하여 중간에 광고를 삽입하기 위한 로직
  const paragraphs = post.content.split('\n\n');
  const midPoint = Math.floor(paragraphs.length / 2);

  const firstHalf = paragraphs.slice(0, midPoint).join('\n\n');
  const secondHalf = paragraphs.slice(midPoint).join('\n\n');

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex-1 flex flex-col">
      <Link href="/blog" className="text-blue-600 hover:underline mb-8 inline-block font-medium">
        ← 목록으로 돌아가기
      </Link>
      
      {/* 블로그 본문 영역 */}
      <article className="mb-24 flex-1">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 leading-tight">{post.title}</h1>
        <p className="text-gray-400 text-sm mb-10 border-b pb-6">{post.date}</p>
        
        <div className="text-gray-700 leading-loose whitespace-pre-wrap text-lg mb-8">
          {firstHalf}
        </div>

        {/* 💡 In-article 애드센스 광고 Placeholder (애드센스 심사 통과 전까지 숨김 처리) */}
        <div id="adsense-placeholder" className="hidden" aria-hidden="true">
          {/* 실제 애드센스 스크립트가 들어갈 위치 */}
        </div>

        <div className="text-gray-700 leading-loose whitespace-pre-wrap text-lg">
          {secondHalf}
        </div>
      </article>

      {/* 💡 핵심: 수익 전환 CTA (메인화면으로 유도) */}
      {/* 광고와 명확히 분리되도록 상단 여백(mb-24 in article)과 디자인을 차별화함 */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl text-center border border-blue-100 shadow-sm mt-auto">
        <h3 className="text-2xl font-bold text-gray-900 mb-3">이론은 끝났습니다. 이제 실전입니다!</h3>
        <p className="text-gray-600 mb-8">
          방금 읽으신 완벽한 구조가 적용된 자소서 초안을 AI가 1분 만에 알아서 작성해 드립니다. 
          백지에서 시작하지 마세요.
        </p>
        <Link href="/" className="inline-block bg-blue-600 text-white font-bold py-4 px-10 rounded-xl hover:bg-blue-700 hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
          👉 AI 자소서 무료로 생성해보기
        </Link>
      </div>
    </div>
  );
}
