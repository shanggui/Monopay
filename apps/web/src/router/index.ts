import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../pages/HomePage.vue'),
    },
    {
      path: '/create',
      name: 'create-room',
      component: () => import('../pages/CreateRoomPage.vue'),
    },
    {
      path: '/join',
      name: 'join',
      component: () => import('../pages/JoinRoomPage.vue'),
    },
    {
      path: '/r/:code',
      name: 'join-room',
      component: () => import('../pages/JoinRoomPage.vue'),
    },
    {
      path: '/room/:code',
      name: 'lobby',
      component: () => import('../pages/LobbyPage.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
