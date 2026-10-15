/**
 * Achievements and Gamification Engine for Kototeka
 * Checks milestones, rewards badges, and produces celebration effects
 */

const ACHIEVEMENTS_DEF = [
  // --- Количество котиков (Прогрессия сложности) ---
  {
    id: 'first_cat',
    icon: '🐾',
    title: 'Первый хвостик',
    desc: 'Добавлен первый котик в коллекцию',
    check: (cats) => cats.length >= 1,
    progress: (cats) => Math.min(cats.length, 1) + '/1'
  },
  {
    id: 'cat_walker',
    icon: '🚶',
    title: 'Дворовый следопыт',
    desc: 'Найдено 5 котиков на улицах города',
    check: (cats) => cats.length >= 5,
    progress: (cats) => Math.min(cats.length, 5) + '/5'
  },
  {
    id: 'cat_baron',
    icon: '👑',
    title: 'Кошачий барон',
    desc: 'Собрана коллекция из 10 котиков',
    check: (cats) => cats.length >= 10,
    progress: (cats) => Math.min(cats.length, 10) + '/10'
  },
  {
    id: 'cat_master',
    icon: '🏰',
    title: 'Мастер котолова',
    desc: 'Серьёзная коллекция из 25 пушистых друзей',
    check: (cats) => cats.length >= 25,
    progress: (cats) => Math.min(cats.length, 25) + '/25'
  },
  {
    id: 'cat_legend',
    icon: '🏆',
    title: 'Легенда улиц',
    desc: 'Целых 50 котиков в коллекции!',
    check: (cats) => cats.length >= 50,
    progress: (cats) => Math.min(cats.length, 50) + '/50'
  },
  {
    id: 'cat_demigod',
    icon: '🌌',
    title: 'Кошачий полубог',
    desc: 'Невероятные 100 котиков! Абсолютный рекорд!',
    check: (cats) => cats.length >= 100,
    progress: (cats) => Math.min(cats.length, 100) + '/100'
  },

  // --- Окрасы ---
  {
    id: 'ginger_squad',
    icon: '🦊',
    title: 'Рыжий легион',
    desc: 'Найдено 5 рыжих котиков',
    check: (cats) => cats.filter(c => (c.color === 'Рыжий' || (c.tags && c.tags.includes('Рыжий')))).length >= 5,
    progress: (cats) => {
      const count = cats.filter(c => (c.color === 'Рыжий' || (c.tags && c.tags.includes('Рыжий')))).length;
      return Math.min(count, 5) + '/5';
    }
  },
  {
    id: 'black_panther',
    icon: '🐈‍⬛',
    title: 'Орден Чёрной пантеры',
    desc: 'Собрано 5 угольно-чёрных котов',
    check: (cats) => cats.filter(c => (c.color === 'Чёрный' || (c.tags && c.tags.includes('Чёрный')))).length >= 5,
    progress: (cats) => {
      const count = cats.filter(c => (c.color === 'Чёрный' || (c.tags && c.tags.includes('Чёрный')))).length;
      return Math.min(count, 5) + '/5';
    }
  },
  {
    id: 'white_snow',
    icon: '🤍',
    title: 'Белоснежка',
    desc: 'Найдено 3 чисто белых котика',
    check: (cats) => cats.filter(c => (c.color === 'Белый' || (c.tags && c.tags.includes('Белый')))).length >= 3,
    progress: (cats) => {
      const count = cats.filter(c => (c.color === 'Белый' || (c.tags && c.tags.includes('Белый')))).length;
      return Math.min(count, 3) + '/3';
    }
  },
  {
    id: 'cat_rainbow',
    icon: '🌈',
    title: 'Кошачья радуга',
    desc: 'Собраны котики минимум 5 различных окрасов',
    check: (cats) => {
      const colors = new Set(cats.map(c => c.color).filter(Boolean));
      return colors.size >= 5;
    },
    progress: (cats) => {
      const colors = new Set(cats.map(c => c.color).filter(Boolean));
      return Math.min(colors.size, 5) + '/5 окрасов';
    }
  },

  // --- Геолокация и обход спуфинга ---
  {
    id: 'anti_spoofing',
    icon: '🎯',
    title: 'Снайпер по карте',
    desc: 'Точка кота указана вручную (обход сбоев GPS)',
    check: (cats) => cats.some(c => c.location && c.location.type === 'manual'),
    progress: (cats) => (cats.some(c => c.location && c.location.type === 'manual') ? '1/1' : '0/1')
  },
  {
    id: 'anti_spoofing_pro',
    icon: '🛡️',
    title: 'Гроза РЭБ',
    desc: '5 котиков с ручной точной меткой на карте',
    check: (cats) => cats.filter(c => c.location && c.location.type === 'manual').length >= 5,
    progress: (cats) => {
      const count = cats.filter(c => c.location && c.location.type === 'manual').length;
      return Math.min(count, 5) + '/5';
    }
  },
  {
    id: 'urban_explorer',
    icon: '🗺️',
    title: 'Картограф-маньяк',
    desc: 'Отмечены котики в 10 различных точках города',
    check: (cats) => {
      const withLoc = cats.filter(c => c.location && c.location.lat && c.location.lng);
      return withLoc.length >= 10;
    },
    progress: (cats) => {
      const withLoc = cats.filter(c => c.location && c.location.lat && c.location.lng);
      return Math.min(withLoc.length, 10) + '/10';
    }
  },

  // --- Повадки и время ---
  {
    id: 'treat_master',
    icon: '🥐',
    title: 'Главный кормилец',
    desc: 'В 5 заметках упомянуто угощение (сосиска, корм, мясо, рыба)',
    check: (cats) => {
      const foodWords = ['еда', 'корм', 'сосис', 'колбас', 'мяс', 'рыб', 'угост', 'купил', 'лакомств', 'покорм'];
      const count = cats.filter(c => c.notes && foodWords.some(w => c.notes.toLowerCase().includes(w))).length;
      return count >= 5;
    },
    progress: (cats) => {
      const foodWords = ['еда', 'корм', 'сосис', 'колбас', 'мяс', 'рыб', 'угост', 'купил', 'лакомств', 'покорм'];
      const count = cats.filter(c => c.notes && foodWords.some(w => c.notes.toLowerCase().includes(w))).length;
      return Math.min(count, 5) + '/5';
    }
  },
  {
    id: 'night_watch',
    icon: '🌑',
    title: 'Ночной дозор',
    desc: '3 котика сфотографированы ночью (с 21:00 до 06:00)',
    check: (cats) => {
      const nightCount = cats.filter(c => {
        const hour = new Date(c.createdAt).getHours();
        return hour >= 21 || hour < 6;
      }).length;
      return nightCount >= 3;
    },
    progress: (cats) => {
      const nightCount = cats.filter(c => {
        const hour = new Date(c.createdAt).getHours();
        return hour >= 21 || hour < 6;
      }).length;
      return Math.min(nightCount, 3) + '/3';
    }
  },
  {
    id: 'sleepy_cat',
    icon: '💤',
    title: 'Сонное царство',
    desc: 'Найдено 5 спящих котиков',
    check: (cats) => cats.filter(c => c.mood === 'Спит' || (c.tags && c.tags.includes('Спит'))).length >= 5,
    progress: (cats) => {
      const count = cats.filter(c => c.mood === 'Спит' || (c.tags && c.tags.includes('Спит'))).length;
      return Math.min(count, 5) + '/5';
    }
  },
  {
    id: 'bandit_patrol',
    icon: '😎',
    title: 'Бандитский район',
    desc: '3 дерзких кота с характером «Бандит»',
    check: (cats) => cats.filter(c => c.mood === 'Бандит' || (c.tags && c.tags.includes('Бандит'))).length >= 3,
    progress: (cats) => {
      const count = cats.filter(c => c.mood === 'Бандит' || (c.tags && c.tags.includes('Бандит'))).length;
      return Math.min(count, 3) + '/3';
    }
  },
  {
    id: 'affection_overload',
    icon: '💖',
    title: 'Мурчащий клубок',
    desc: '5 ласковых или мурчащих котиков',
    check: (cats) => cats.filter(c => c.mood === 'Ласковый' || c.mood === 'Мурчит').length >= 5,
    progress: (cats) => {
      const count = cats.filter(c => c.mood === 'Ласковый' || c.mood === 'Мурчит').length;
      return Math.min(count, 5) + '/5';
    }
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
    } catch (e) {}
  }

  playMeowSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

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
