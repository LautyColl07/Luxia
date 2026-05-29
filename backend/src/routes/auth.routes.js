const express = require('express');
const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth'); // Asegurate de que la ruta al middleware sea correcta
const router = express.Router();

function isValidMatricula(matricula) {
  if (!matricula || !matricula.trim()) return true; // Es opcional
  return /^\d+$/.test(matricula.trim()); // Chequea que sean solo números
}

async function isMatriculaUnique(matricula) {
  if (!matricula || !matricula.trim()) return true;
  const existing = await prisma.user.findFirst({
    where: { matricula: matricula.trim() }
  });
  return !existing;
}

router.post('/register', requireFirebaseAuth, async (req, res) => {
  try {
    const {
      firebaseUid,
      email,
      firstName,
      lastName,
      username,
      matricula,
      estudioJuridico
    } = req.body;

    if (!firebaseUid || !email) {
      return res.status(400).json({ error: 'firebaseUid y email son obligatorios' });
    }

    if (matricula && !isValidMatricula(matricula)) {
      return res.status(400).json({ error: 'La matrícula debe contener solo números' });
    }

    if (matricula && !(await isMatriculaUnique(matricula))) {
      return res.status(400).json({ error: 'La matrícula ya está registrada' });
    }

    const user = await prisma.user.create({
      data: {
        firebaseUid: firebaseUid,
        email: email.trim(),
        name: `${firstName} ${lastName}`.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: `${firstName} ${lastName}`.trim(),
        username: username?.trim() || null,
        matricula: matricula?.trim() || null,
        estudioJuridico: estudioJuridico?.trim() || null,
        role: 'user' // Se asigna por defecto el rol base
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario registrado correctamente',
      user: {
        id: user.id,
        email: user.email,
        matricula: user.matricula,
        estudioJuridico: user.estudioJuridico
      }
    });

  } catch (error) {
    console.error('[AUTH] Error en registro:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El email o la matrícula ya están registrados' });
    }
    return res.status(500).json({ error: 'Error al registrar usuario', details: error.message });
  }
});

module.exports = router;