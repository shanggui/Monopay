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
    {
      path: '/room/:code/ledger',
      name: 'ledger',
      component: () => import('../pages/LedgerPage.vue'),
    },
    {
      path: '/room/:code/bank',
      name: 'bank',
      component: () => import('../pages/BankPage.vue'),
    },
    {
      path: '/room/:code/pay',
      name: 'pay',
      component: () => import('../pages/PayPage.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
