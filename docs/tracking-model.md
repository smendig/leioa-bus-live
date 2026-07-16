# Cómo se estiman los buses

Leioa Bus Live no recibe coordenadas GPS. Consulta las llegadas previstas de todas las paradas y
sitúa cada bus en un punto plausible del tramo que conduce a su próxima parada.

## Qué hace el modelo

- Identifica cada vehículo por su número de bus y línea.
- Conserva el identificador de servicio como evidencia adicional, sin usarlo todavía como identidad
  principal.
- Usa tiempos típicos de cada tramo y línea, aprendidos de la captura histórica.
- Descarta llegadas marcadas como inválidas y picos aislados que contradicen las dos paradas
  vecinas.
- Avanza la posición suavemente mientras la próxima parada no cambia.
- Reduce la confianza cuando la previsión se repite, salta o no encaja bien con la ruta.
- Conserva brevemente un bus que falta en una consulta para evitar parpadeos.
- Oculta únicamente previsiones que acumulan señales claras de estar obsoletas.

La captura histórica permitió mejorar los tiempos típicos por línea y tramo. Aun así, los datos de
origen son minutos enteros y a menudo se repiten durante varias consultas de 15 segundos. Parecen
ser previsiones calculadas por el sistema de transporte, no posiciones GPS directas. El origen
público no permite saber qué señales operativas usa internamente.

La dirección mostrada procede del nombre de destino incluido en cada llegada. La topología pública
solo expone una secuencia de paradas por línea, no direcciones separadas de ida y vuelta.

## Cómo leer el mapa

Las posiciones son estimadas. Una confianza alta indica que las llegadas recientes son coherentes;
una confianza media indica una aproximación; y una confianza baja o antigua significa que conviene
tomar la posición con cautela.

La aplicación distingue también entre una franja sin servicio previsto y una ausencia inesperada
de datos durante el horario publicado.

## Límite importante

Sin GPS ni observaciones manuales no se puede medir el error exacto en metros. Los datos históricos
sirven para comprobar la coherencia temporal y ajustar cuánto suele durar cada tramo, pero no para
afirmar que el icono representa la ubicación física exacta del autobús.
