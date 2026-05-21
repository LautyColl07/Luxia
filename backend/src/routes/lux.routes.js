const express = require('express');

const { sendMessageToLux } = require('../services/luxAi.service');

const router = express.Router();

router.post('/chat', async (req, res) => {
  const { message, context = {} } = req.body || {};

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'El mensaje es obligatorio.',
    });
  }

  console.log('[LUX] Consulta recibida');

  try {
    const reply = await sendMessageToLux(message, context);

    return res.json({
      success: true,
      reply,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'No pude conectarme con LUX en este momento.',
    });
  }
});

module.exports = router;
