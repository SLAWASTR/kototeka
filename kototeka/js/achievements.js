/**
 * Achievements and Gamification Engine for Kototeka
 * Checks milestones, rewards badges, and produces celebration effects
 */

const ACHIEVEMENTS_DEF = [
  {
    id: 'first_cat',
    icon: '🐾',
    title: 'Первый хвостик',
    desc: 'Добавлен первый котик в коллекцию',
    check: (cats) => cats.length >= 1,
    progress: (cats) => Math.min(cats.length, 1) + '/1'
  },
  {
    id: 'anti_spoofing',
    icon: '🎯',
    title: 'Снайпер по карте',
    desc: 'Точка кота указана вручную (обход сбоев GPS)',
    check: (cats) => cats.some(c => c.location && c.location.type === 'manual'),
    progress: (cats) => (cats.some(c => c.location && c.location.type === 'manual') ? '1/1' : '0/1')
  },
  {
    id: 'ginger_squad',
    icon: '🦊',
    title: 'Рыжая банда',
    desc: 'Найдено 3 рыжих котика',
    check: (cats) => cats.filter(c => (c.color === 'Рыжий' || (c.tags && c.tags.includes('Рыжий')))).length >= 3,
    progress: (cats) => {
      const count = cats.filter(c => (c.color === 'Рыжий' || (c.tags && c.tags.includes('Рыжий')))).length;
      return Math.min(count, 3) + '/3';
    }
  },
  {
    id: 'black_panther',
    icon: '🐈‍⬛',
    title: 'Чёрная пантера',
    desc: 'Найден хотя бы один угольно-чёрный котик',
    check: (cats) => cats.some(c => c.color === 'Чёрный' || (c.tags && c.tags.includes('Чёрный'))),
    progress: (cats) => (cats.some(c => c.color === 'Чёрный' || (c.tags && c.tags.includes('Чёрный'))) ? '1/1' : '0/1')
  },
  {
    id: 'sleepy_cat',
    icon: '💤',
    title: 'Сонное царство',
    desc: 'Замечен спящий котик',
    check: (cats) => cats.some(c => c.mood === 'Спит' || (c.tags && c.tags.includes('Спит'))),
    progress: (cats) => (cats.some(c => c.mood === 'Спит' || (c.tags && c.tags.includes('Спит'))) ? '1/1' : '0/1')
  },
  {
    id: 'treat_master',
    icon: '🥐',
    title: 'Сытый друг',
    desc: 'В заметках упомянуто угощение (еда, сосиска, корм, лакомство)',
    check: (cats) => {
      const foodWords = ['еда', 'корм', 'сосис', 'колбас', 'мяс', 'рыб', 'угост', 'купил', 'лакомств', 'покорм'];
      return cats.some(c => c.notes && foodWords.some(w => c.notes.toLowerCase().includes(w)));
    },
    progress: (cats) => {
      const foodWords = ['еда', 'корм', 'сосис', 'колбас', 'мяс', 'рыб', 'угост', 'купил', 'лакомств', 'покорм'];
      const ok = cats.some(c => c.notes && foodWords.some(w => c.notes.toLowerCase().includes(w)));
      return ok ? '1/1' : '0/1';
    }
  },
  {
    id: 'night_watch',
    icon: '🌑',
    title: 'Ночной дозор',
    desc: 'Кот сфотографирован в тёмное время суток (после 21:00 или до 06:00)',
    check: (cats) => cats.some(c => {
      const hour = new Date(c.createdAt).getHours();
      return hour >= 21 || hour < 6;
    }),
    progress: (cats) => {
      const ok = cats.some(c => {
        const hour = new Date(c.createdAt).getHours();
        return hour >= 21 || hour < 6;
      });
      return ok ? '1/1' : '0/1';
    }
  },
  {
    id: 'urban_explorer',
    icon: '🗺️',
    title: 'Городской следопыт',
    desc: 'Отмечены котики в 3 различных локациях',
    check: (cats) => {
      const withLoc = cats.filter(c => c.location && c.location.lat && c.location.lng);
      return withLoc.length >= 3;
    },
    progress: (cats) => {
      const withLoc = cats.filter(c => c.location && c.location.lat && c.location.lng);
      return Math.min(withLoc.length, 3) + '/3';
    }
  },
  {
    id: 'cat_baron',
    icon: '👑',
    title: 'Кошачий барон',
    desc: 'Собрана солидная коллекция из 10 котиков',
    check: (cats) => cats.length >= 10,
    progress: (cats) => Math.min(cats.length, 10) + '/10'
  },
  {
    id: 'cat_legend',
    icon: '🏆',
    title: 'Легенда дворов',
    desc: 'Целых 25 котиков в коллекции!',
    check: (cats) => cats.length >= 25,
    progress: (cats) => Math.min(cats.length, 25) + '/25'
  }
];

class AchievementManager {
  constructor() {
    this.unlockedIds = new Set(JSON.parse(localStorage.getItem('kototeka_achievements') || '[]'));
  }

  getUnlockedList() {
    return Array.from(this.unlockedIds);
  }

  isUnlocked(id) {
    return this.unlockedIds.has(id);
  }

  checkAll(cats) {
    const newlyUnlocked = [];
    for (const ach of ACHIEVEMENTS_DEF) {
      if (!this.unlockedIds.has(ach.id)) {
        try {
          if (ach.check(cats)) {
            this.unlockedIds.add(ach.id);
            newlyUnlocked.push(ach);
          }
        } catch (e) {
          console.error('Error checking achievement', ach.id, e);
        }
      }
    }

    if (newlyUnlocked.length > 0) {
      localStorage.setItem('kototeka_achievements', JSON.stringify(Array.from(this.unlockedIds)));
      for (const ach of newlyUnlocked) {
        this.triggerNotification(ach);
      }
    }

    return newlyUnlocked;
  }

  triggerNotification(ach) {
    this.playCelebrationSound();

    // Show floating toast
    const toast = document.createElement('div');
    toast.className = 'achievement-toast animate-bounce-in';
    toast.innerHTML = `
      <div class="ach-icon-bubble">${ach.icon}</div>
      <div class="ach-text">
        <div class="ach-badge-label">🏆 Новое достижение!</div>
        <div class="ach-title">${ach.title}</div>
        <div class="ach-desc">${ach.desc}</div>
      </div>
    `;

    const container = document.getElementById('toastContainer') || document.body;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }, 4500);
  }

  playCelebrationSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Play cute harmonious arpeggio chime (C5 - E5 - G5 - C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const startTime = ctx.currentTime + index * 0.09;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.36);
      });
    } catch (e) {
      // Audio autoplay might be muted
    }
  }

  playMeowSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Synthesize a cute playful "meow" pitch curve
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(780, t + 0.15);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.35);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch (e) {}
  }
}

window.achievementManager = new AchievementManager();
window.ACHIEVEMENTS_DEF = ACHIEVEMENTS_DEF;
