const express = require('express');

const authController = require('../controllers/authController');
const casesController = require('../controllers/casesController');
const dashboardController = require('../controllers/dashboardController');
const legalStudiesController = require('../controllers/legalStudiesController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true });
});

router.use(requireAuth);

router.get('/auth/me', authController.getMe);
router.get('/dashboard/resumen', dashboardController.getDashboardSummary);

router.get('/cases', casesController.listCases);
router.post('/cases', casesController.createCase);
router.get('/cases/:id', casesController.getCaseById);
router.put('/cases/:id', casesController.updateCase);
router.delete('/cases/:id', casesController.deleteCase);

router.get('/causas', casesController.listCases);
router.post('/causas', casesController.createCase);
router.get('/causas/:id', casesController.getCaseById);
router.put('/causas/:id', casesController.updateCase);
router.delete('/causas/:id', casesController.deleteCase);

router.post('/legal-studies', legalStudiesController.createLegalStudy);
router.get('/legal-studies/my', legalStudiesController.listMyLegalStudies);
router.get('/legal-studies/:id', legalStudiesController.getLegalStudyById);
router.patch('/legal-studies/:id', legalStudiesController.updateLegalStudy);
router.delete('/legal-studies/:id', legalStudiesController.deleteLegalStudy);
router.post('/legal-studies/:id/members', legalStudiesController.addMember);
router.get('/legal-studies/:id/members', legalStudiesController.listMembers);
router.patch('/legal-studies/:id/members/:memberId', legalStudiesController.updateMember);
router.delete('/legal-studies/:id/members/:memberId', legalStudiesController.deleteMember);

module.exports = router;
