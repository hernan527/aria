const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiService = require('../services/aiService');

// GET /api/leads - Obtener todos los leads
router.get('/', async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { fecha_creacion: 'desc' }
    });
    res.json(leads);
  } catch (err) {
    console.error('Error obteniendo leads:', err);
    res.status(500).json({ error: `Error get leads: ${err.message}` });
  }
});

// GET /api/leads/pendientes - Get leads sin analizar por IA
router.get('/pendientes', async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { ai_score: null },
      orderBy: { fecha_creacion: 'desc' }
    });
    res.json(leads);
  } catch (err) {
    console.error('Error get pendientes:', err);
    res.status(500).json({ error: `Error getting pendientes: ${err.message}` });
  }
});

// GET api/leads/top - Get leads mejor valorados por IA
router.get('/top', async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { ai_score: { not: null } },
      orderBy: { ai_score: 'desc' },
      take: 20
    });
    res.json(leads);
  } catch (err) {
    console.error('Error get top leads:', err);
    res.status(500).json({ error: `Error getting top leads: ${err.message}` });
  }
});

// POST /api/leads - Crear nuevo lead
router.post('/', async (req, res) => {
  try {
    let datos = req.body;

    // Si no tiene fecha, añadirla
    if (!datos.fecha_creacion) {
      datos.fecha_creacion = new Date();
    }
    
    const nuevoLead = await prisma.lead.create({
      data: datos
    });

    // Análisis asíncrono por IA (no bloquea la creación)
    setTimeout(async () => {
      try {
        await analizarConIA(nuevoLead.id);
      } catch (err) {
        console.error(`Error análisis IA para lead ${nuevoLead.id}:`, err);
      }
    }, 100);

    res.status(201).json(nuevoLead);

  } catch (err) {
    console.error('Error creando lead:', err);
    res.status(500).json({ error: `Error creating lead: ${err.message}` });
  }
});

// GET /api/leads/:id - Obtener lead específico
router.get('/:id', async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(lead);
  } catch (err) {
    console.error('Error get lead:', err);
    res.status(500).json({ error: `Error getting lead: ${err.message}` });
  }
});

// PUT /api/leads/:id - Actualizar lead
router.put('/:id', async (req, res) => {
  try {
    const leadActualizado = await prisma.lead.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });

    res.json(leadActualizado);
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: `Error updating lead: ${err.message}` });
  }
});

// PATCH /api/leads/:id/estado - Actualiza el estado de un lead
router.patch('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    
    if (!estado || !['nuevo', 'contactado', 'en_proceso', 'convertido', 'descartado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const leadActualizado = await prisma.lead.update({
      where: { id: parseInt(req.params.id) },
      data: { estado }
    });

    res.json(leadActualizado);
  } catch (err) {
    console.error('Error actualizando estado:', err);
    res.status(500).json({ error: `Error updating lead status: ${err.message}` });
  }
});

// POST /api/leads/:id/analizar - Forzar análisis por IA de un lead específico
router.post('/:id/analizar', async (req, res) => {
  try {
    const lead = await analizarConIA(parseInt(req.params.id));
    res.json({ message: 'Lead analizado con éxito', lead });
  } catch (err) {
    res.status(500).json({ error: `Error en análisis IA: ${err.message}` });
  }
});

// Función interna para analizar leads con IA
async function analizarConIA(leadId) {
  console.log(`Iniciando análisis IA para lead ${leadId}...`);
  
  try {
    // Obtener lead actual
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    if (lead.ai_score !== null) {
      console.log(`El lead ${leadId} ya tiene análisis IA`);
      return lead; // Salir si ya tiene análisis
    }

    // Análisis por IA externa
    const analisisIA = await aiService.analizarLead(lead);

    // Actualizar lead con resultado de IA
    const leadActualizado = await prisma.lead.update({
      where: { id: leadId },
      data: {
        ai_score: analisisIA.score,
        ai_analysis: analisisIA.analisis,
        ai_razones: analisisIA.razones,
        ai_precio_sugerido: analisisIA.precio_estimado,
        ai_fecha_analisis: new Date()
      }
    });

    console.log(`✅ Análisis IA completed para lead ${leadId} con score: ${analisisIA.score}`);
    return leadActualizado;

  } catch (error) {
    console.error('Error in análisis IA:', error);
    throw error;
  }
}

// POST /api/leads/lote/analizar - Analizar varios leads a la vez
router.post('/lote/analizar', async (req, res) => {
  try {
    const { leadIds } = req.body;
    console.log('Procesando lote de leads:', leadIds);

    if (!leadIds || !Array.isArray(leadIds)) {
      return res.status(400).json({ error: 'LeadIds debe ser un array' });
    }

    // Usar Promise.all para procesar en paralelo (más rápido) pero limitado
    const resultados = await Promise.allSettled(
      leadIds.map(async (id) => {
        try {
          return await analizarConIA(id);
        } catch (err) {
          // console.error(`Error procesando lead ${id}:`, err);
          return { id, error: err.message };
        }
      })
    );

    const exitos = resultados.filter(r => r.status === 'fulfilled' && !r.value.error).map(r => r.value);
    const fallos = resultados.filter(r => r.status === 'rejected' || (r.value && r.value.error));

    res.json({
      message: `Análisis completado: ${exitos.length} exitos, ${fallos.length} fallos`,
      exitos, 
      fallos: fallos.map(f => ({
        id: f.reason ? 'unknown' : f.value.id,
        error: f.reason ? f.reason.message : f.value.error
      }))
    });

  } catch (err) {
    console.error('Error en análisis en lote:', err);
    res.status(500).json({ error: `Error analyzing batch: ${err.message}` });
  }
});

module.exports = router;