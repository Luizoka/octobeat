import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Partículas desenhadas em <canvas> por cima da pista. O loop só roda enquanto
// houver partículas vivas, e nada aqui passa pelo React a cada frame.

const MAX_PARTICLES = 700;

export const ParticleCanvas = forwardRef(function ParticleCanvas(_props, ref) {
  const canvasRef = useRef(null);
  const state = useRef({ particles: [], rings: [], running: false, frame: 0, last: 0, width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    const resize = () => {
      const s = state.current;
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.width = parent.clientWidth;
      s.height = parent.clientHeight;
      canvas.width = Math.round(s.width * s.dpr);
      canvas.height = Math.round(s.height * s.dpr);
    };
    resize();
    // Inicializa o contexto 2D e o modo "lighter" já na montagem: fazer isso na
    // primeira explosão causava uma travada no começo da música.
    const context = canvas.getContext("2d");
    if (context) {
      // Desenha uma vez cada tipo de forma usado (retângulo, círculo, elipse).
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 0.01;
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#ffffff";
      context.fillRect(0, 0, 2, 2);
      context.beginPath();
      context.arc(4, 4, 2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(8, 8, 4, 2, 0, 0, Math.PI * 2);
      context.stroke();
      context.clearRect(0, 0, 16, 16);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    }
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(state.current.frame);
      state.current.running = false;
    };
  }, []);

  useImperativeHandle(ref, () => {
    const s = state.current;

    const loop = (now) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!context) { s.running = false; return; }
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      context.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      context.clearRect(0, 0, s.width, s.height);
      context.globalCompositeOperation = "lighter";

      s.particles = s.particles.filter((p) => {
        p.age += dt;
        if (p.age >= p.life) return false;
        p.vx *= 1 - p.drag * dt;
        p.vy = p.vy * (1 - p.drag * dt) + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const fade = 1 - p.age / p.life;
        context.globalAlpha = fade;
        context.fillStyle = p.color;
        const size = p.size * (0.4 + fade * 0.6);
        if (p.shape === "spark") {
          context.fillRect(p.x - size / 2, p.y - size * 1.5, size, size * 3);
        } else {
          context.beginPath();
          context.arc(p.x, p.y, size, 0, Math.PI * 2);
          context.fill();
        }
        return true;
      });

      s.rings = s.rings.filter((ring) => {
        ring.age += dt;
        if (ring.age >= ring.life) return false;
        const t = ring.age / ring.life;
        context.globalAlpha = (1 - t) * 0.9;
        context.strokeStyle = ring.color;
        context.lineWidth = ring.width * (1 - t) + 0.5;
        context.beginPath();
        context.ellipse(ring.x, ring.y, ring.radius * (0.25 + t), ring.radius * (0.25 + t) * 0.45, 0, 0, Math.PI * 2);
        context.stroke();
        return true;
      });

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      if (s.particles.length || s.rings.length) s.frame = requestAnimationFrame(loop);
      else { s.running = false; context.clearRect(0, 0, s.width, s.height); }
    };

    const ensureRunning = () => {
      if (s.running) return;
      s.running = true;
      s.last = performance.now();
      s.frame = requestAnimationFrame(loop);
    };

    return {
      /** Explosão de partículas a partir de (x, y). */
      burst(x, y, color, {
        count = 14, speed = 260, size = 3, gravity = 700, life = 0.6, angle = -Math.PI / 2, spread = Math.PI * 1.6, drag = 1.5, shape = "dot",
      } = {}) {
        const total = Math.min(Math.round(count), MAX_PARTICLES - s.particles.length);
        for (let index = 0; index < total; index += 1) {
          const direction = angle + (Math.random() - 0.5) * spread;
          const velocity = speed * (0.45 + Math.random() * 0.75);
          s.particles.push({
            x, y,
            vx: Math.cos(direction) * velocity,
            vy: Math.sin(direction) * velocity,
            size: size * (0.6 + Math.random() * 0.8),
            color, gravity, drag, shape,
            age: 0,
            life: life * (0.6 + Math.random() * 0.6),
          });
        }
        if (total > 0) ensureRunning();
      },
      /** Onda de choque achatada (perspectiva da linha de acerto). */
      ring(x, y, color, { radius = 70, life = 0.35, width = 4 } = {}) {
        s.rings.push({ x, y, color, radius, life, width, age: 0 });
        ensureRunning();
      },
      size() {
        return { width: s.width, height: s.height };
      },
      clear() {
        s.particles = [];
        s.rings = [];
      },
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />;
});
