import model from './intent-model.js';
import { predict, normalize } from './learning.js';
import { parseCommand, mm } from './core.js';
const number = '(\\d+(?:[.,]\\d+)?)';
function unit(value) { return value.startsWith('metro') ? 'm' : value.startsWith('cent') ? 'cm' : value.startsWith('mili') ? 'mm' : value; }
function dimension(text, label) {
  const expression = new RegExp(`(?:${label})(?:\\s+(?:interior|de|e|é|das|dos|as|os|a|o))*\\s*${number}\\s*(milimetros?|centimetros?|metros?|mm|cm|m)\\b`);
  const result = text.match(expression); return result ? mm(result[1], unit(result[2])) : undefined;
}
export class LocalAssistant {
  constructor() { this.pending = null; }
  cancel() { this.pending = null; }
  interpret(text) {
    if (text.length > 2000) throw new Error('O pedido é demasiado longo para esta versão.');
    try {
      const exact = parseCommand(text); this.pending = null; return { ...exact, source: 'guided' };
    } catch { /* Natural-language interpretation follows; all dimensions are still validated. */ }
    const normalized = normalize(text), prediction = predict(model, text);
    const pair = normalized.match(new RegExp(`${number}\\s*(?:x|×|por)\\s*${number}\\s*(milimetros?|centimetros?|metros?|mm|cm|m)\\b`));
    const dimensions = {};
    if (pair) { dimensions.width = mm(pair[1], unit(pair[3])); dimensions.height = mm(pair[2], unit(pair[3])); }
    dimensions.width ??= dimension(normalized, 'largura');
    dimensions.height ??= dimension(normalized, 'comprimento|altura');
    dimensions.thickness = dimension(normalized, 'paredes|parede|espessura');
    const hasDimensions = Object.values(dimensions).some(value => value !== undefined);
    if (prediction.intent === 'room' && prediction.confidence >= 0.45 && prediction.coverage >= 0.35 || this.pending && hasDimensions) {
      const pending = { ...this.pending };
      for (const [key, value] of Object.entries(dimensions)) if (value !== undefined) pending[key] = value;
      this.pending = pending;
      const missing = [['width', 'largura interior'], ['height', 'comprimento interior'], ['thickness', 'espessura das paredes']].filter(([key]) => !pending[key]).map(([, label]) => label);
      if (missing.length) return { type: 'clarification', message: `Preciso de: ${missing.join(', ')}. Indica as unidades (m, cm ou mm).`, source: 'local-ml' };
      this.pending = null;
      return { type: 'room', ...pending, source: 'local-ml' };
    }
    return { type: 'unsupported', message: 'Ainda consigo criar divisões retangulares com medidas explícitas. Exemplo: “desenha uma sala de 4 por 5 metros, com paredes de 20 cm”. Para desfazer, refazer ou cancelar, usa esses comandos. Não executo pedidos que não consiga validar.', source: 'local-ml' };
  }
}
