'use strict';

/**
 * semantic-search.js — 增强版语义相似度计算
 *
 * 功能：
 *   1. TF-IDF + Cosine Similarity（替代简单 Jaccard）
 *   2. 支持中文分词
 *   3. 可选：使用 Embedding API（如 OpenAI embeddings）
 *
 * 依赖：
 *   npm install natural compromise
 */

// 尝试加载中文分词库
let compromise = null;
try {
  compromise = require('compromise');
} catch (e) {
  console.warn('[SemanticSearch] compromise not installed, using basic tokenizer');
}

// ── 配置 ─────────────────────────────────────────────────────────────────────
const SEMANTIC_CONFIG = {
  // 文本预处理
  PREPROCESS: {
    removeStopwords: true,      // 移除停用词
    lowercase: true,            // 转小写
    removeNumbers: true,        // 移除数字
    minLength: 2,               // 最小词长
  },

  // 相似度阈值
  THRESHOLDS: {
    EXACT_MATCH: 0.95,          // 精确匹配
    HIGH_SIMILAR: 0.85,         // 高度相似
    MEDIUM_SIMILAR: 0.70,       // 中度相似
  },

  // TF-IDF 参数
  TF_IDF: {
    useIDF: true,
    smoothIDF: true,
    sublinearTF: true,          // 使用对数词频
  },
};

// ── 中文停用词表 ────────────────────────────────────────────────────────────
const CHINESE_STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '那',
]);

// ── 文本预处理器 ────────────────────────────────────────────────────────────
class TextPreprocessor {
  /**
   * 预处理文本
   */
  static preprocess(text) {
    if (!text) return '';

    let processed = text;

    // 转小写
    if (SEMANTIC_CONFIG.PREPROCESS.lowercase) {
      processed = processed.toLowerCase();
    }

    // 移除 URL
    processed = processed.replace(/https?:\/\/\S+/g, ' ');

    // 移除特殊字符
    processed = processed.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');

    // 移除数字
    if (SEMANTIC_CONFIG.PREPROCESS.removeNumbers) {
      processed = processed.replace(/\d+/g, ' ');
    }

    // 分词
    const tokens = this.tokenize(processed);

    // 移除停用词和短词
    const filtered = tokens.filter(token =>
      token.length >= SEMANTIC_CONFIG.PREPROCESS.minLength &&
      !CHINESE_STOPWORDS.has(token)
    );

    return filtered;
  }

  /**
   * 分词（支持中英文）
   */
  static tokenize(text) {
    // 如果有 compromise，使用其 NLP 功能
    if (compromise) {
      try {
        const doc = compromise(text);
        return doc.terms().out('array');
      } catch (e) {
        // Fallback to simple split
      }
    }

    // 简单分词：按空格和标点分割
    return text.split(/[\s,.\n]+/).filter(t => t.length > 0);
  }
}

// ── TF-IDF 向量化器 ─────────────────────────────────────────────────────────
class TfidfVectorizer {
  constructor() {
    this.vocabulary = new Map(); // word -> index
    this.idf = [];               // IDF values
    this.documents = [];         // Training documents
  }

  /**
   * 训练向量器
   */
  fit(documents) {
    this.documents = documents;
    const wordDocCount = new Map(); // word -> number of documents containing it

    // 构建词汇表和文档频率
    documents.forEach((doc, docIdx) => {
      const wordSet = new Set(doc);
      wordSet.forEach(word => {
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, this.vocabulary.size);
        }
        wordDocCount.set(word, (wordDocCount.get(word) || 0) + 1);
      });
    });

    // 计算 IDF
    const numDocs = documents.length;
    this.idf = new Array(this.vocabulary.size).fill(0);

    for (const [word, idx] of this.vocabulary.entries()) {
      const df = wordDocCount.get(word) || 1;
      // IDF with smoothing
      this.idf[idx] = Math.log((numDocs + 1) / (df + 1)) + 1;
    }

    return this;
  }

  /**
   * 转换文档为 TF-IDF 向量
   */
  transform(documents) {
    return documents.map(doc => {
      const tf = new Map();
      doc.forEach(word => {
        tf.set(word, (tf.get(word) || 0) + 1);
      });

      // 转换为 TF-IDF 向量
      const vector = new Array(this.vocabulary.size).fill(0);
      for (const [word, idx] of this.vocabulary.entries()) {
        let termFreq = tf.get(word) || 0;

        // Sublinear TF: 1 + log(tf)
        if (SEMANTIC_CONFIG.TF_IDF.sublinearTF && termFreq > 0) {
          termFreq = 1 + Math.log(termFreq);
        }

        vector[idx] = termFreq * this.idf[idx];
      }

      return vector;
    });
  }

  /**
   * 拟合并转换
   */
  fitTransform(documents) {
    this.fit(documents);
    return this.transform(documents);
  }
}

// ── 余弦相似度计算 ──────────────────────────────────────────────────────────
class CosineSimilarity {
  /**
   * 计算两个向量的余弦相似度
   */
  static calculate(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 批量计算相似度
   */
  static batchCalculate(vectors, targetVector) {
    return vectors.map(vec => this.calculate(vec, targetVector));
  }
}

// ── 语义搜索管理器 ──────────────────────────────────────────────────────────
class SemanticSearchManager {
  constructor() {
    this.vectorizer = new TfidfVectorizer();
    this.documentCache = new Map(); // id -> document
    this.vectorCache = new Map();   // id -> vector
    this.isTrained = false;
  }

  /**
   * 添加文档到索引
   */
  addDocument(id, text) {
    const tokens = TextPreprocessor.preprocess(text);
    this.documentCache.set(id, tokens);

    // 如果已训练，直接计算向量
    if (this.isTrained) {
      const vector = this.vectorizer.transform([tokens])[0];
      this.vectorCache.set(id, vector);
    }
  }

  /**
   * 批量添加文档
   */
  addDocuments(docs) {
    docs.forEach(({ id, text }) => this.addDocument(id, text));
  }

  /**
   * 训练模型（在所有文档添加后调用）
   */
  train() {
    const documents = Array.from(this.documentCache.values());
    this.vectorizer.fitTransform(documents);
    this.isTrained = true;

    // 重新计算所有向量
    const vectors = this.vectorizer.transform(documents);
    documents.forEach((doc, idx) => {
      const id = Array.from(this.documentCache.keys())[idx];
      this.vectorCache.set(id, vectors[idx]);
    });

    console.log(`[SemanticSearch] Trained on ${documents.length} documents`);
  }

  /**
   * 查找相似文档
   */
  findSimilar(text, options = {}) {
    const {
      threshold = SEMANTIC_CONFIG.THRESHOLDS.MEDIUM_SIMILAR,
      limit = 5,
    } = options;

    const queryTokens = TextPreprocessor.preprocess(text);
    const queryVector = this.vectorizer.transform([queryTokens])[0];

    const similarities = [];
    for (const [id, vector] of this.vectorCache.entries()) {
      const sim = CosineSimilarity.calculate(queryVector, vector);
      if (sim >= threshold) {
        similarities.push({ id, similarity: sim });
      }
    }

    // 排序并返回 top N
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * 检查是否重复
   */
  isDuplicate(text, threshold = SEMANTIC_CONFIG.THRESHOLDS.HIGH_SIMILAR) {
    const similar = this.findSimilar(text, { threshold, limit: 1 });
    return similar.length > 0;
  }

  /**
   * 清除缓存
   */
  clear() {
    this.documentCache.clear();
    this.vectorCache.clear();
    this.isTrained = false;
  }
}

// ── 导出单例 ─────────────────────────────────────────────────────────────────
const semanticSearch = new SemanticSearchManager();

module.exports = {
  semanticSearch,
  SemanticSearchManager,
  TextPreprocessor,
  TfidfVectorizer,
  CosineSimilarity,
  SEMANTIC_CONFIG,
};
