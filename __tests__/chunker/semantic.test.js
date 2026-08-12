'use strict';

const chunkSemantic = require('../../src/chunker/semantic');

describe('Chunker: Semantic', () => {
  test('resume with sections splits per section', () => {
    const text = `
EXPERIENCE:
Worked at Google for 5 years building distributed search infrastructure with Python and Go. Led a team of 8 engineers delivering real-time indexing pipelines processing 10 million documents per hour. Designed and implemented fault-tolerant microservices architecture using Kubernetes, gRPC, and Redis for inter-service communication. Mentored junior developers and conducted over 50 technical interviews for the platform team.

SKILLS:
Python, Go, Kubernetes, Docker, TensorFlow, PostgreSQL, Redis, gRPC, Apache Kafka, Elasticsearch, Prometheus, Grafana, CI/CD pipelines, distributed systems, real-time data processing, machine learning infrastructure, performance optimization, technical leadership.

EDUCATION:
Bachelor of Science in Computer Science from Massachusetts Institute of Technology, graduated in 2015 with honors. Completed advanced coursework in distributed systems, machine learning, algorithms, and data structures. Published two research papers on efficient graph processing algorithms.
    `.trim();

    const result = chunkSemantic(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
    result.forEach((c) => expect(c.strategy).toBe('semantic'));
    // Check section titles are captured
    const titles = result.map((c) => c.metadata.sectionTitle).filter(Boolean);
    expect(titles.length).toBeGreaterThan(0);
  });

  test('text without sections splits by paragraphs', () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) =>
      `This is paragraph ${i}. ` + Array(60).fill(`word${i}`).join(' ')
    );
    const text = paragraphs.join('\n\n');
    const result = chunkSemantic(text, { maxChunkSize: 100 });

    expect(result.length).toBeGreaterThan(1);
  });

  test('small chunks are merged', () => {
    const text = `
INTRO:
Hi.

SKILLS:
JS.

EXPERIENCE:
Worked somewhere for a while doing things.
    `.trim();

    const result = chunkSemantic(text, { minChunkSize: 10 });
    // Very small sections should get merged
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('chunk indices are sequential', () => {
    const text = 'A '.repeat(500) + '\n\nB '.repeat(500);
    const result = chunkSemantic(text, { maxChunkSize: 200 });
    result.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});
