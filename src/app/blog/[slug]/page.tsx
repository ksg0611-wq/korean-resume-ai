import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPostData } from '@/lib/blogData';
import { extractFaq, parseMarkdownBlocks } from '@/lib/blogMarkdown';
import BlogMarkdown, { createLinkState } from '@/components/BlogMarkdown';
import { BUSINESS_INFO, SITE_URL } from '@/lib/siteConfig';

// 동적 메타데이터 생성 (SEO)
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = getPostData(params.slug);
  
  if (!post) {
    return {
      title: 'Post Not Found | Korea Resume AI',
    };
  }

  return {
    title: `${post.title} | Korea Resume AI`,
    description: post.excerpt,
    alternates: {
      canonical: `https://korea-resume.com/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
    },
  };
}

/** JSON-LD 스크립트 삽입 시 </script> 조기 종료 방지 */
function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPostData(params.slug);

  if (!post) {
    notFound();
  }

  const isMarkdown = post.format === 'markdown';
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}`;

  // 수익 창출(광고) 승인 여부를 제어하는 플래그
  const ADS_APPROVED = process.env.NEXT_PUBLIC_ADS_APPROVED === 'true';

  // 기존 글: 본문을 적절히 분할하여 중간에 광고를 삽입하기 위한 로직
  const paragraphs = post.content.split('\n\n');
  const midPoint = Math.floor(paragraphs.length / 2);
  const firstHalf = paragraphs.slice(0, midPoint).join('\n\n');
  const secondHalf = paragraphs.slice(midPoint).join('\n\n');

  // 신규 글(markdown): 블록 단위 렌더링 + Article / FAQPage 구조화 데이터
  const blocks = isMarkdown ? parseMarkdownBlocks(post.content) : [];
  const blockMid = Math.floor(blocks.length / 2);
  const linkState = createLinkState();
  const faqItems = isMarkdown ? extractFaq(post.content) : [];

  const articleJsonLd = isMarkdown
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt,
        inLanguage: 'ko-KR',
        datePublished: post.date,
        dateModified: post.date,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
        author: { '@type': 'Organization', name: BUSINESS_INFO.serviceName, url: SITE_URL },
        publisher: { '@type': 'Organization', name: BUSINESS_INFO.serviceName, url: SITE_URL },
      }
    : null;

  const faqJsonLd =
    isMarkdown && faqItems.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        }
      : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex-1 flex flex-col">
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(articleJsonLd) }}
        />
      )}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(faqJsonLd) }}
        />
      )}

      <Link href="/blog" className="text-blue-600 hover:underline mb-8 inline-block font-medium">
        ← 목록으로 돌아가기
      </Link>
      
      {/* 블로그 본문 영역 */}
      <article className="mb-24 flex-1">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 leading-tight">{post.title}</h1>
        <p className="text-gray-400 text-sm mb-10 border-b pb-6">{post.date}</p>
        
        {isMarkdown ? (
          <>
            <div className="mb-8">
              <BlogMarkdown
                blocks={blocks.slice(0, blockMid)}
                links={post.internalLinks}
                used={linkState}
                keyPrefix="a"
              />
            </div>

            {ADS_APPROVED && (
              <div className="my-12 py-8 bg-gray-50 flex items-center justify-center text-gray-400 rounded-lg">
                {/* 승인 완료 시 스크립트 삽입 영역 */}
              </div>
            )}

            <BlogMarkdown
              blocks={blocks.slice(blockMid)}
              links={post.internalLinks}
              used={linkState}
              keyPrefix="b"
            />
          </>
        ) : (
          <>
            <div className="text-gray-700 leading-loose whitespace-pre-wrap text-lg mb-8">
              {firstHalf}
            </div>

            {ADS_APPROVED && (
              <div className="my-12 py-8 bg-gray-50 flex items-center justify-center text-gray-400 rounded-lg">
                {/* 승인 완료 시 스크립트 삽입 영역 */}
              </div>
            )}

            <div className="text-gray-700 leading-loose whitespace-pre-wrap text-lg">
              {secondHalf}
            </div>
          </>
        )}

        {post.relatedLinks && post.relatedLinks.length > 0 && (
          <aside className="mt-12 p-5 rounded-xl border border-gray-200 bg-gray-50">
            <h2 className="text-base font-bold text-gray-900 mb-2">함께 읽으면 좋은 글</h2>
            <ul className="space-y-1.5 list-disc pl-5">
              {post.relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-blue-600 underline underline-offset-2 hover:text-blue-800">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>

      {/* 💡 핵심: 수익 전환 CTA (메인화면으로 유도) */}
      {/* 광고와 명확히 분리되도록 상단 여백(mb-24 in article)과 디자인을 차별화함 */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl text-center border border-blue-100 shadow-sm mt-auto">
        <h3 className="text-2xl font-bold text-gray-900 mb-3">이론은 끝났습니다. 이제 실전입니다!</h3>
        <p className="text-gray-600 mb-8">
          방금 읽으신 완벽한 구조가 적용된 자소서 초안을 AI가 1분 만에 알아서 작성해 드립니다. 
          백지에서 시작하지 마세요.
        </p>
        <Link href={post.ctaTarget || "/"} className="inline-block bg-blue-600 text-white font-bold py-4 px-10 rounded-xl hover:bg-blue-700 hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
          {post.ctaLabel ? post.ctaLabel : '👉 AI 자소서 무료로 생성해보기'}
        </Link>
      </div>
    </div>
  );
}
