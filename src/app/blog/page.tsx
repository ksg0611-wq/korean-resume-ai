import Link from 'next/link';
import { Metadata } from 'next';
import { blogPosts } from '@/lib/blogData';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: '취업 가이드 블로그 | Korean Resume AI',
    description: '서류 통과부터 면접까지, 검증된 취업 꿀팁과 합격하는 자소서 작성 가이드를 제공합니다.',
    openGraph: {
      title: '취업 가이드 블로그 | Korean Resume AI',
      description: '서류 통과부터 면접까지, 검증된 취업 꿀팁과 합격하는 자소서 작성 가이드를 제공합니다.',
      type: 'website',
      url: '/blog',
    },
  };
}

export default function BlogIndex() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 flex-1">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">합격을 부르는 취업 가이드</h1>
        <p className="text-gray-600">서류 통과부터 면접까지, 검증된 취업 꿀팁</p>
      </div>
      
      <div className="grid gap-6">
        {[...blogPosts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`}>
            <div className="border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-blue-300 transition duration-300 cursor-pointer bg-white h-full flex flex-col">
              <h2 className="text-xl font-bold mb-2 text-gray-800">{post.title}</h2>
              <p className="text-gray-600 mb-4 line-clamp-2 flex-grow">{post.excerpt}</p>
              <span className="text-sm text-gray-400 font-medium">{post.date}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
