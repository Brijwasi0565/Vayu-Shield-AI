import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeId, escapeCsvCell, escapeHtml, isSafeHttpUrl } from './sanitize';

test('escapeHtml neutralizes HTML control characters to prevent XSS', () => {
  assert.equal(
    escapeHtml('<script>alert("xss")</script> & \'test\''),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;',
  );
});

test('isSafeHttpUrl allows http/https and rejects javascript/data/vbscript URIs', () => {
  assert.equal(isSafeHttpUrl('https://airquality.gov.in/stations'), true);
  assert.equal(isSafeHttpUrl('http://localhost:3000/map'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
});

test('escapeCsvCell neutralizes spreadsheet formula injection and escapes quotes', () => {
  assert.equal(escapeCsvCell('=cmd|"/C calc"!A0'), '"\'=cmd|""/C calc""!A0"');
  assert.equal(escapeCsvCell('+1+1'), '"\'+1+1"');
  assert.equal(escapeCsvCell('-2*3'), '"\'-2*3"');
  assert.equal(escapeCsvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
  assert.equal(escapeCsvCell('\t=1'), '"\'\t=1"');
  assert.equal(escapeCsvCell('Normal "cough" note'), '"Normal ""cough"" note"');
  assert.equal(escapeCsvCell(null), '""');
});

test('createSafeId produces unique prefixed identifiers without Math.random', () => {
  const a = createSafeId('sym');
  const b = createSafeId('sym');
  assert.match(a, /^sym_[a-f0-9-]{8,}$/);
  assert.notEqual(a, b);
});
