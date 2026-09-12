import { createRouter, createWebHashHistory } from 'vue-router'
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/datasets' },
    { path: '/datasets', name: 'datasets', component: () => import('./pages/DatasetList.vue') },
    {
      path: '/datasets/new',
      name: 'dataset-new',
      component: () => import('./pages/DatasetForm.vue')
    },
    {
      path: '/datasets/:id',
      name: 'dataset-detail',
      component: () => import('./pages/DatasetDetail.vue')
    },
    {
      path: '/datasets/:id/edit',
      name: 'dataset-edit',
      component: () => import('./pages/DatasetForm.vue')
    },
    {
      path: '/datasets/:id/annotate/:imageId?',
      name: 'annotate',
      component: () => import('./pages/AnnotationView.vue'),
      props: (route) => ({
        datasetId: Number(route.params.id),
        startImageId: route.params.imageId ? Number(route.params.imageId) : null,
        readonly: route.query.readonly === '1'
      })
    },
    {
      path: '/datasets/:id/export',
      name: 'export',
      component: () => import('./pages/ExportDialog.vue')
    }
  ]
})
export { router }
