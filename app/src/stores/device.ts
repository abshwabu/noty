import { defineStore } from 'pinia';

export type ActiveDrawer = 'none' | 'left' | 'right';

export const useDeviceStore = defineStore('device', {
  state: () => ({
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
    screenHeight: typeof window !== 'undefined' ? window.innerHeight : 768,
    activeDrawer: 'none' as ActiveDrawer,
    showTabSwitcher: false,
    isKeyboardOpen: false,
    isTouchDevice: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  }),

  getters: {
    isMobile: (state) => state.screenWidth < 768,
    isTablet: (state) => state.screenWidth >= 768 && state.screenWidth < 1024,
    isDesktop: (state) => state.screenWidth >= 1024,
  },

  actions: {
    initListeners() {
      if (typeof window === 'undefined') return;

      const updateDimensions = () => {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
      };

      window.addEventListener('resize', updateDimensions);
      window.addEventListener('orientationchange', () => {
        setTimeout(updateDimensions, 100);
      });

      // Detect virtual keyboard on modern mobile browsers
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
          if (window.visualViewport) {
            const heightDiff = window.innerHeight - window.visualViewport.height;
            this.isKeyboardOpen = heightDiff > 150;
          }
        });
      }

      // Initialize touch swipe listeners for drawers
      this.initSwipeListeners();
    },

    openLeftDrawer() {
      this.activeDrawer = 'left';
    },

    openRightDrawer() {
      this.activeDrawer = 'right';
    },

    closeDrawers() {
      this.activeDrawer = 'none';
    },

    toggleTabSwitcher() {
      this.showTabSwitcher = !this.showTabSwitcher;
    },

    initSwipeListeners() {
      if (typeof window === 'undefined') return;

      let startX = 0;
      let startY = 0;
      let isTracking = false;

      window.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length !== 1) return;
          const touch = e.touches[0];
          startX = touch.clientX;
          startY = touch.clientY;
          isTracking = true;
        },
        { passive: true }
      );

      window.addEventListener(
        'touchend',
        (e) => {
          if (!isTracking) return;
          isTracking = false;

          const touch = e.changedTouches[0];
          const deltaX = touch.clientX - startX;
          const deltaY = touch.clientY - startY;

          // Must be predominantly horizontal gesture (> 50px deltaX, < 80px deltaY)
          if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 80) {
            if (this.isMobile) {
              if (deltaX > 0 && startX < 45 && this.activeDrawer === 'none') {
                // Swipe from left edge -> Open Left Drawer
                this.openLeftDrawer();
              } else if (deltaX < 0 && startX > window.innerWidth - 45 && this.activeDrawer === 'none') {
                // Swipe from right edge -> Open Right Drawer
                this.openRightDrawer();
              } else if (deltaX < -50 && this.activeDrawer === 'left') {
                // Swipe left when left drawer is open -> Close Left Drawer
                this.closeDrawers();
              } else if (deltaX > 50 && this.activeDrawer === 'right') {
                // Swipe right when right drawer is open -> Close Right Drawer
                this.closeDrawers();
              }
            }
          }
        },
        { passive: true }
      );
    },
  },
});
