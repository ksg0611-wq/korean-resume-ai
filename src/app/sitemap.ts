import { MetadataRoute } from 'next';
import { blogPosts } from '@/lib/blogData';
import { dbQuery } from '@/lib/db/client';

export const revalidate = 3600; // 1시간마다 sitemap 갱신

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://korea-resume.com';

  // 동적 블로그 포스트 URL 생성
  const blogUrls: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  // 동적 채용공고 상세 페이지 URL (현재 진행 중인 공고 최대 500개 색인)
  let jobUrls: MetadataRoute.Sitemap = [];
  try {
    const jobs = await dbQuery<{ sn: number; updated_at: string }>(
      "SELECT sn, updated_at FROM job_postings WHERE status = 'open' ORDER BY end_date ASC, sn DESC LIMIT 500;"
    );
    jobUrls = jobs.map((job) => ({
      url: `${baseUrl}/jobs/${job.sn}`,
      lastModified: job.updated_at ? new Date(job.updated_at) : new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    }));
  } catch (error) {
    console.warn('[sitemap] Failed to fetch dynamic job postings for sitemap:', error);
  }

  // 정적 페이지와 동적 목록 배열 병합 반환
  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/jobs`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...blogUrls,
    ...jobUrls,
  ];
}
