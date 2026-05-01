const Groq = require('groq-sdk');

class AIService {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    this.model = 'llama-3.3-70b-versatile';
  }

  async analizarLead(lead) {
    try {
      const prompt = this.generarPromptAnalisis(lead);
      
      const response = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            "content": "Eres un experto analista en salud digital y comercialización de servicios de consulta médica. Tu tarea es analiar leads y calificarlos para determinar su potencial de conversión a consultas pagadas."
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 500
      });

      const analysisJSON = this.extraerJSON(response.choices[0].message.content);
      return analysisJSON;

    } catch (error) {
      console.error('Error analizando lead con IA:', error);
      throw new Error('Error en análisis de IA');
    }
  }

  generarPromptAnalisis(lead) {
    return `Reglas específicas para calificar leads de SaludOk: {
      "servicios_premium": {
        "consultas_especializada": 80,
        "cirugia_estética": 90,
        "tratamiento_cancer": 95,
        "cirugia_cardiaca": 100
      },
      "frecuencias_óptimas": {
        "alta": "consultas frecuentes o tratamientos prolongados",
        "media": "tratamiento puntual o consulta especialista",
        "baja": "consulta general única"
      },
      "urgencias_potenciales": {
        "alta": ["cardiología", "oncología", "neurología", "urgencias"],
        "media": ["ortopedia", "ginecología", "pediatría", "dermatología"],
        "baja": ["consultas_generales", "medicina preventiva"]
      }
    }

    Analiza este lead y califícalo del 1-100:
    - Nombre: ${lead.nombre}
    - Edad: ${lead.edad || 'No especificada'}
    - Ciudad: ${lead.ciudad || 'No especificada'}
    - Tipo consulta: ${lead.tipo_consulta}
    - Urgencia: ${lead.urgencia}
    - Mensaje: ${lead.mensaje || 'Sin descripción'}

    RESPONDE EXCLAMAMENTE UN JSON válido con esta estructura:
    {
      "score": (puntuación 0-100),
      "analisis": (análisis detallado en máx 300 caracteres),
      "razones": (array string con las 3 razones principales del score),
      "precio_estimado": (monto USD que probablemente gastará),
      "recomendacion": ("contactar_urgente", "seguimiento_medio", "educacion_y_fomento", "descartado")
    }

    CRÍTÉRIOS CLAVE:
    - Nombres reconocibles (30+ años) = mayor estabilidad económica
    - Ciudades principales = mayor poder adquisitivo
    - Consultas especializadas ucrgentas = alta conversión
    - Rango ideal para contacto urgente: score >70
    - Segmentación prioritaria: premium + urgente + mayor de edad
    - Respuesta directa en JSON puro. No incluyas nada más`;
  }

  extraerJSON(responseText) {
    try {
      // Extractar JSON válido del texto
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}') + 1;
      const jsonString = responseText.substring(jsonStart, jsonEnd);
      
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('Error parsing AI response, usando valores por defecto:', responseText);
      // Respuesta por defecto si la IA falla
      return {
        "score": 50,
        "analisis": "Análisis generado automáticamente, no completa la calificación detallada debido a complejidad del mensaje",
        "razones": ["Análisis simplificado", "Requiere revisión manual", "Datos subóptimos del prospecto"],
        "precio_estimado": 500,
        "recomendacion": "seguimiento_medio"
      };
    }
  }

  async generarRespuestaMensualidad(datos) {
    try {
      const response = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente de servicio al cliente de SaludOk, ayudas a convertir leads en pacientes'
          },
          {
            role: 'user',
            content: `Genera una respuesta corta y profesional para un lead con la intención de: ${datos.intencion}.`
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3
      });

      return response.choices[0].message.content;

    } catch (error) {
      console.error('Error generando respuesta:', error);
      throw new Error('Error generando respuesta automatizada');
    }
  }
}

module.exports = new AIService();