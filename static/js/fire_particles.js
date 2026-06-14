/**
 * FireSafe AI - Aesthetic Ember Particles
 * Renders glowing floating sparks from bottom to top
 */
(function () {
    const canvas = document.createElement('canvas');
    canvas.id = 'spark-canvas';
    canvas.style.cssText = [
        'position:fixed', 'top:0', 'left:0',
        'width:100%', 'height:100%',
        'pointer-events:none', 'z-index:2' // Overlay over the background but behind UI interactions
    ].join(';');
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Spark {
        constructor() {
            this.reset(true);
        }

        reset(initial = false) {
            this.x = Math.random() * canvas.width;
            // Spawn anywhere if initial, otherwise spawn near the bottom
            this.y = initial ? Math.random() * canvas.height : canvas.height + Math.random() * 200;

            // Sizes from the screenshot: elegant, tiny dots with a few larger ones
            this.size = Math.random() < 0.9 ? Math.random() * 1.5 + 0.5 : Math.random() * 3 + 1.5;

            // Speed going bottom to top (mn tht lfog)
            this.vy = -(Math.random() * 1.5 + 0.5);
            // Drifting sideways slightly
            this.vx = (Math.random() - 0.5) * 0.8;
            this.wavy = Math.random() * 0.03 + 0.01;

            // Colors: Deep orange, bright orange, some yellow
            const colorType = Math.random();
            if (colorType < 0.3) {
                this.color = '255, 200, 50'; // Yellowish
            } else if (colorType < 0.8) {
                this.color = '255, 120, 20'; // Orange
            } else {
                this.color = '255, 60, 10';  // Deep red/orange
            }

            this.life = 0;
            this.maxLife = Math.random() * 300 + 100;
            this.baseAlpha = Math.random() * 0.7 + 0.3;
        }

        update() {
            this.life++;
            // Add a wavy drift effect
            this.x += this.vx + Math.sin(this.life * this.wavy) * 0.8;
            this.y += this.vy;

            // Reset if it goes off the top screen
            if (this.y < -30 || this.life >= this.maxLife) {
                this.reset();
            }
        }

        draw() {
            let alpha = this.baseAlpha;
            // Fade in and fade out
            if (this.life < 30) {
                alpha *= (this.life / 30);
            } else if (this.life > this.maxLife - 50) {
                alpha *= ((this.maxLife - this.life) / 50);
            }
            // Twinkle effect
            const twinkle = Math.abs(Math.sin(this.life * 0.05));
            alpha = alpha * (0.6 + twinkle * 0.4);

            ctx.save();
            ctx.globalCompositeOperation = 'screen';

            // Outer glow
            const glowDist = this.size * 4;
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowDist);
            g.addColorStop(0, `rgba(${this.color}, ${alpha})`);
            g.addColorStop(0.5, `rgba(${this.color}, ${alpha * 0.4})`);
            g.addColorStop(1, `rgba(${this.color}, 0)`);

            ctx.beginPath();
            ctx.arc(this.x, this.y, glowDist, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();

            // Intense inner core
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 240, 200, ${alpha * 0.9})`;
            ctx.fill();

            ctx.restore();
        }
    }

    const numSparks = window.innerWidth < 800 ? 100 : 250;
    const sparks = Array.from({ length: numSparks }, () => new Spark());

    (function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        sparks.forEach(s => { s.update(); s.draw(); });
        requestAnimationFrame(loop);
    })();
})();
