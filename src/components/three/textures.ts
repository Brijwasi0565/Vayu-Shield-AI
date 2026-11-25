import * as THREE from 'three';

export function createPerforatedTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, 256, 256);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#d4d4d4';
  bCtx.fillRect(0, 0, 256, 256);

  for (let y = 8; y < 256; y += 16) {
    for (let x = 8; x < 256; x += 16) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = '#202020';
      bCtx.beginPath();
      bCtx.arc(x, y, 3.4, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 2);

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(4, 2);

  return { map, bump };
}

export function createPleatedHepaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = x % 16 === 0 ? '#e2e8f0' : '#94a3b8';
    ctx.fillRect(x, 0, 4, 128);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + 4, 0, 4, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.6, 'rgba(15, 23, 42, 0.2)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
