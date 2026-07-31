const { marked } = require('marked');
const markedFootnote = require('marked-footnote');

marked.use(markedFootnote());
console.log(marked.parse('Hello[^1]\n\n[^1]: World'));
