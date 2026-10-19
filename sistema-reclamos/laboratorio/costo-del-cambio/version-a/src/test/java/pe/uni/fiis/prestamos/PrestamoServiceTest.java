package pe.uni.fiis.prestamos;

import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

class PrestamoServiceTest {

    private final LocalDate hoy = LocalDate.of(2026, 10, 5);

    @Test
    void presta_un_equipo_libre() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        String id = s.prestar("20231234", "proyector-01", "clase de redes", hoy);
        assertNotNull(id);
        assertEquals(1, s.prestamosDe("20231234").size());
    }

    @Test
    void no_presta_un_equipo_que_ya_esta_prestado() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        s.prestar("20231234", "proyector-01", "clase de redes", hoy);
        assertThrows(IllegalStateException.class, () -> s.prestar("20235678", "proyector-01", "clase de redes", hoy));
    }

    @Test
    void el_urgente_tambien_exige_quien_autoriza() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        assertThrows(IllegalArgumentException.class, () -> s.prestarUrgente("20231234", "laptop-03", "", "clase de redes", hoy));
    }

    @Test
    void al_devolver_el_equipo_queda_libre() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        String id = s.prestar("20231234", "laptop-03", "clase de redes", hoy);
        s.devolver(id);
        assertDoesNotThrow(() -> s.prestar("20235678", "laptop-03", "clase de redes", hoy));
    }

    @Test
    void rechaza_tercer_equipo_normal_y_urgente() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        s.prestar("20231234", "equipo-1", "clase", hoy);
        s.prestarUrgente("20231234", "equipo-2", "jefe", "proyecto", hoy);
        IllegalStateException normal = assertThrows(IllegalStateException.class,
                () -> s.prestar("20231234", "equipo-3", "clase", hoy));
        assertTrue(normal.getMessage().contains("dos equipos"));
        IllegalStateException urgente = assertThrows(IllegalStateException.class,
                () -> s.prestarUrgente("20231234", "equipo-3", "jefe", "clase", hoy));
        assertTrue(urgente.getMessage().contains("dos equipos"));
        assertEquals(2, s.prestamosDe("20231234").size());
    }

    @Test
    void rechaza_motivo_nulo_vacio_y_solo_espacios() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        for (String motivo : new String[]{null, "", "   "}) {
            assertThrows(IllegalArgumentException.class,
                    () -> s.prestar("20231234", "equipo-1", motivo, hoy));
            assertThrows(IllegalArgumentException.class,
                    () -> s.prestarUrgente("20231234", "equipo-1", "jefe", motivo, hoy));
        }
        assertEquals(0, s.prestamosDe("20231234").size());
    }

    @Test
    void devolver_libera_un_cupo_y_conserva_el_motivo() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        String id = s.prestar("20231234", "equipo-1", "clase de redes", hoy);
        s.prestar("20231234", "equipo-2", "proyecto", hoy);
        s.devolver(id);
        assertEquals("clase de redes", s.prestamosDe("20231234").getFirst().motivo);
        assertTrue(s.prestamosDe("20231234").getFirst().filaCsv.endsWith(";clase de redes"));
        assertDoesNotThrow(() -> s.prestar("20231234", "equipo-3", "sustentación", hoy));
        assertEquals(3, s.prestamosDe("20231234").size());
    }

    @Test
    void el_tope_es_independiente_para_cada_alumno() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        s.prestar("20231234", "equipo-1", "clase", hoy);
        s.prestar("20231234", "equipo-2", "proyecto", hoy);
        assertDoesNotThrow(() -> s.prestar("20235678", "equipo-3", "clase", hoy));
    }

    @Test
    void guarda_motivo_y_conserva_plazos_normal_y_urgente() {
        PrestamoService s = new PrestamoService(new BaseDeDatos());
        s.prestar("20231234", "equipo-1", "clase", hoy);
        s.prestarUrgente("20231234", "equipo-2", "jefe", "proyecto", hoy);
        assertEquals("clase", s.prestamosDe("20231234").get(0).motivo);
        assertEquals("proyecto", s.prestamosDe("20231234").get(1).motivo);
        assertEquals(hoy.plusDays(7), s.prestamosDe("20231234").get(0).devolucion);
        assertEquals(hoy.plusDays(1), s.prestamosDe("20231234").get(1).devolucion);
    }
}
