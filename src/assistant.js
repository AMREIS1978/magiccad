import model from './intent-model.js';
import { predict, normalize } from './learning.js';
import { parseCommand, mm, validateEntity } from './core.js';
const number = '(-?\\d+(?:[.,]\\d+)?)';
const units = '(milimetros?|centimetros?|metros?|mm|cm|m)';
const names = { sala: 'Sala', quarto: 'Quarto', divisao: 'Divisão', cozinha: 'Cozinha', escritorio: 'Escritório', wc: 'WC', suite: 'Suite', corredor: 'Corredor', 'casa de banho': 'Casa de banho' };
const words = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quinze: 15, dezasseis: 16, dezessete: 17, dezoito: 18, dezanove: 19, vinte: 20 };
function unit(value) { return value.startsWith('metro') ? 'm' : value.startsWith('cent') ? 'cm' : value.startsWith('mili') ? 'mm' : value; }
function dimension(text, label) {
  const expression = new RegExp(`(?:${label})(?:\\s+(?:interior|de|e|das|dos|as|os|a|o|com))*\\s*${number}\\s*${units}\\b`);
  const result = text.match(expression); return result ? mm(result[1], unit(result[2])) : undefined;
}
export class LocalAssistant {
  constructor() { this.pending = null; this.doorPending = null; }
  cancel() { this.pending = null; this.doorPending = null; }
  interpret(text, context = {}) {
    if (text.length > 2000) throw new Error('O pedido é demasiado longo para esta versão.');
    const clean = normalize(text).trim();
    if (/^(?:mostra|mostrar|ver|enquadrar) (?:tudo|todo o desenho|a planta)$/.test(clean) || /^(?:zoom all|z a)$/.test(clean)) return { type: 'zoom-all', message: 'Vou enquadrar todo o desenho.' };
    if (/^(ola|bom dia|boa tarde|boa noite|ajuda|o que podes fazer)[!? .]*$/.test(clean)) return { type: 'answer', message: 'Posso preparar divisões e portas, pedir as medidas em falta e ativar TRIM, copiar, mover ou offset. Experimenta “quero uma sala de 4 por 5 metros, com paredes de 20 cm”. Também posso enquadrar tudo. Para desenho preciso à mão, usa o modo Manual e a linha de comandos.' };
    try { const exact = parseCommand(text); this.pending = null; this.doorPending = null; return { ...exact, source: 'guided' }; }
    catch { /* Try natural language; dimensional validation remains mandatory. */ }
    const normalized = clean.replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quinze|dezasseis|dezessete|dezoito|dezanove|vinte)\b/g, word => words[word]);
    if (/\bportas?\b/.test(clean) || this.doorPending && (!/\b(sala|quarto|divisao)\b/.test(clean) || context.rooms?.some(r=>normalize(r.name)===clean)) && !/\b(trim|aparar|copiar|duplicar|offset|mover)\b/.test(clean)) {
      if (/\b(cria|criar|quero|faz)\b/.test(clean) && /\b(sala|quarto|divisao)\b/.test(clean) && /\d\s*(?:x|por)\s*\d/.test(clean)) return {type:'clarification',message:'Vamos fazer por etapas: confirma primeiro a divisão; depois colocamos a porta.'};
      if (/\b(janelas?|escadas?|3d|render|estrutura)\b/.test(clean)) return {type:'unsupported',message:'Posso inserir uma porta numa divisão existente. Os restantes elementos deste pedido ainda não são suportados.'};
      const rooms=context.rooms ?? [];
      if(!rooms.length) return {type:'answer',message:'Precisamos primeiro de uma divisão para colocar a porta. Vamos criar uma?',suggestions:['Quero uma sala de 4 por 5 metros','Ajuda']};
      const pending={...this.doorPending};
      const named=rooms.filter(r=>clean.includes(normalize(r.name)));
      if(named.length===1) pending.roomId=named[0].id;
      if(!pending.roomId) pending.roomId=rooms.find(r=>context.selection?.includes(r.id))?.id ?? (rooms.length===1?rooms[0].id:undefined);
      const room=rooms.find(r=>r.id===pending.roomId);
      if(!room) {this.doorPending=pending;return {type:'clarification',message:'Em que divisão queres colocar a porta? Seleciona-a na planta ou indica o nome.',suggestions:rooms.slice(0,6).map(r=>r.name)};}
      const measure=normalized.match(new RegExp(`porta(?:\\s+(?:de|com|largura))*\\s*${number}\\s*${units}\\b`));
      const width=measure ? mm(measure[1],unit(measure[2])) : dimension(normalized,'largura');
      const location=normalized.match(new RegExp(`(?:(?:a|distancia(?: de)?)\\s+)?${number}\\s*${units}\\s+(?:do|da)\\s+canto`));
      const convert=(value,u)=>/^0(?:[.,]0+)?$/.test(value)?0:mm(value,unit(u));
      if(width!==undefined) pending.width=width;
      if(location) pending.offset=convert(location[1],location[2]);
      const short=normalized.match(new RegExp(`^${number}\\s*${units}[.! ]*$`));
      if(short) { if(pending.width===undefined) pending.width=mm(short[1],unit(short[2])); else if(pending.offset===undefined) pending.offset=convert(short[1],short[2]); }
      if(/\b(parede|superior|inferior|norte|sul|oeste|este)\b/.test(clean) || /^(esquerda|direita)$/.test(clean)) {
        const wall=/\b(superior|norte)\b/.test(clean)?'north':/\b(inferior|sul)\b/.test(clean)?'south':/\b(esquerda|oeste)\b/.test(clean)?'west':/\b(direita|este)\b/.test(clean)?'east':undefined;
        if(wall) pending.wall=wall;
      }
      if(/\b(dobradica|inicio|fim)\b/.test(clean)) { if(/\b(inicio|esquerda|topo)\b/.test(clean)) pending.hinge='start'; else if(/\b(fim|direita|fundo)\b/.test(clean)) pending.hinge='end'; }
      this.doorPending=pending;
      if(pending.width===undefined) return {type:'clarification',message:`Vamos colocar a porta em ${room.name}. Qual é a largura do vão?`,suggestions:['80 cm','90 cm','1 metro']};
      if(!pending.wall) return {type:'clarification',message:'Em que parede? Podes escolher na lista.',suggestions:['Parede superior','Parede inferior','Parede esquerda','Parede direita']};
      const horizontal=['north','south'].includes(pending.wall), length=horizontal?room.width:room.height;
      if(pending.offset===undefined) return {type:'clarification',message:`A que distância do canto ${horizontal?'esquerdo':'superior'} começa o vão? A parede tem ${length/1000} m.`,suggestions:['0 m do canto','A 1 metro do canto']};
      if(!pending.hinge) return {type:'clarification',message:'Onde fica a dobradiça? A folha abre para o interior.',suggestions:['Dobradiça no início','Dobradiça no fim']};
      try { validateEntity({...room,doors:[...(room.doors??[]),{wall:pending.wall,width:pending.width,offset:pending.offset,hinge:pending.hinge}]}); }
      catch(error) { this.doorPending={roomId:room.id}; return {type:'clarification',message:`${error.message} Vamos corrigir: qual é a largura da porta?`,suggestions:['80 cm','90 cm']}; }
      this.doorPending=null;this.pending=null;
      return {type:'door',...pending,source:'guided',message:'A porta está preparada. Revê a abertura na confirmação antes de aplicar.'};
    }
    const operation=/\b(trim|aparar|cortar)\b/.test(clean)?'tr':/\b(copiar|duplica|duplicar)\b/.test(clean)?'co':/\b(offset|paralela|paralelas)\b/.test(clean)?'o':/\b(mover|deslocar)\b/.test(clean)?'m':null;
    if(operation) { this.doorPending=null; return {type:'cad',command:operation,message:'Ferramenta ativada. Segue as instruções na linha de comandos para escolher objetos e medidas.'}; }
    const prediction = predict(model, text);
    const target = clean.match(/\b(casa de banho|sala|quarto|divisao|cozinha|escritorio|wc|suite|corredor)\b/);
    if (/\b(janelas?|escadas?|telhado|estrutura|betao|licenciamento|regulamento|3d|render)\b/.test(clean)) return { type: 'unsupported', message: 'Esse pedido inclui elementos que ainda não consigo desenhar ou validar. Nesta versão posso preparar divisões retangulares. Usa as ferramentas manuais para linhas e retângulos; janelas, 3D e validação legal ainda não estão implementados.' };
    const pair = normalized.match(new RegExp(`${number}\\s*(?:x|×|por)\\s*${number}(?:\\s*${units}\\b)?`));
    const dimensions = {};
    if (pair?.[3]) { dimensions.width = mm(pair[1], unit(pair[3])); dimensions.height = mm(pair[2], unit(pair[3])); }
    dimensions.width ??= dimension(normalized, 'largura');
    dimensions.height ??= dimension(normalized, 'comprimento|altura');
    dimensions.thickness = dimension(normalized, 'paredes|parede|espessura');
    const unitReply = normalized.match(new RegExp(`^(?:em )?${units}[.! ]*$`));
    if (this.pending?.unscaled && unitReply) { dimensions.width = mm(this.pending.unscaled[0], unit(unitReply[1])); dimensions.height = mm(this.pending.unscaled[1], unit(unitReply[1])); }
    if (this.pending?.width && this.pending?.height && !this.pending.thickness) {
      const wallReply = normalized.match(new RegExp(`^${number}\\s*${units}[.! ]*$`));
      if (wallReply) dimensions.thickness = mm(wallReply[1], unit(wallReply[2]));
    }
    const hasDimensions = Object.values(dimensions).some(value => value !== undefined);
    const isRoom = !!target || prediction.intent === 'room' && prediction.confidence >= 0.45 && prediction.coverage >= 0.35;
    if (isRoom) this.doorPending=null;
    if (isRoom || this.pending && (hasDimensions || pair || unitReply)) {
      const pending = { ...this.pending };
      if (target) pending.name = names[target[1]];
      for (const [key, value] of Object.entries(dimensions)) if (value !== undefined) pending[key] = value;
      if (pair && !pair[3]) {
        if (pair[1].startsWith('-') || pair[2].startsWith('-')) throw new Error('As dimensões da divisão têm de ser positivas.');
        pending.unscaled = [pair[1], pair[2]]; delete pending.width; delete pending.height;
      }
      if (pending.width && pending.height) delete pending.unscaled;
      this.pending = pending;
      if (pending.unscaled) return { type: 'clarification', message: `As dimensões ${pending.unscaled[0]} × ${pending.unscaled[1]} estão em metros, centímetros ou milímetros? Responde, por exemplo, “metros”.`, source: 'local-ml', suggestions:['Metros','Centímetros','Milímetros'] };
      const missing = [['width', 'largura interior'], ['height', 'comprimento interior'], ['thickness', 'espessura das paredes']].filter(([key]) => !pending[key]).map(([, label]) => label);
      if (missing.length) return { type: 'clarification', message: `Preciso de ${missing.join(' e ')}. ${pending.width && pending.height ? 'Para as paredes podes responder só “20 cm”.' : 'Podes indicar “4 por 5 metros, paredes de 20 cm”.'}`, source: 'local-ml', suggestions: pending.width && pending.height ? ['Paredes de 15 cm','Paredes de 20 cm'] : ['4 por 5 metros','3 por 4 metros'] };
      validateEntity({ id: 'proposal', type: 'room', x: 0, y: 0, name: pending.name ?? 'Divisão', ...pending });
      this.pending = null;
      return { type: 'room', ...pending, source: 'local-ml' };
    }
    return { type: 'unsupported', message: 'Ainda não consigo executar esse pedido. Experimenta “quero uma sala de 4 por 5 metros com paredes de 20 cm”, ou escreve “ajuda” para ver as capacidades atuais.', source: 'local-ml' };
  }
}
