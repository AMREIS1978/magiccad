// Small, local multinomial Naive Bayes model, trained from labelled Portuguese requests.
const stopwords = new Set('a o as os um uma de do da dos das com em no na e que eu quero por favor para me uma um ao'.split(' '));
export function normalize(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function tokens(text) { return (normalize(text).match(/[a-z]+/g) ?? []).filter(word => !stopwords.has(word) && word.length > 1); }
export function train(samples) {
  const classes = {}, vocabulary = new Set();
  for (const sample of samples) {
    const entry = classes[sample.intent] ??= { documents: 0, words: {}, total: 0 }; entry.documents++;
    for (const word of tokens(sample.text)) { vocabulary.add(word); entry.words[word] = (entry.words[word] ?? 0) + 1; entry.total++; }
  }
  return { algorithm: 'multinomial-naive-bayes', version: 1, classes, vocabulary: [...vocabulary].sort(), examples: samples.length };
}
export function predict(model, text) {
  const vocabulary = new Set(model.vocabulary), input = tokens(text);
  const known = input.filter(word => vocabulary.has(word));
  const scored = Object.entries(model.classes).map(([intent, data]) => ({ intent, log: known.reduce((sum, word) => sum + Math.log(((data.words[word] ?? 0) + 1) / (data.total + vocabulary.size)), 0) }));
  scored.sort((a, b) => b.log - a.log);
  const max = scored[0].log, sum = scored.reduce((total, item) => total + Math.exp(item.log - max), 0);
  return { intent: scored[0].intent, confidence: Math.exp(scored[0].log - max) / sum, coverage: input.length ? known.length / input.length : 0 };
}
