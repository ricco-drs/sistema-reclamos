package pe.uni.fiis.prestamos.dominio;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Prueba de dominio: corre sin infraestructura. El doble vive acá mismo. */
class PrestamoServiceTest {

    private final LocalDate hoy = LocalDate.of(2026, 10, 5);

    /** Repositorio de mentira, en tres líneas. No hace falta base de datos. */
    static class RepositorioFalso implements RepositorioDePrestamos {
        final List<Prestamo> filas = new ArrayList<>();
        public void guardar(Prestamo p) { filas.removeIf(x -> x.id().equals(p.id())); filas.add(p); }
        public List<Prestamo> todos() { return filas; }
        public List<Prestamo> deAlumno(String c) { return filas.stream().filter(p -> p.codigoAlumno().equals(c)).toList(); }
        public Prestamo porId(String id) { return filas.stream().filter(p -> p.id().equals(id)).findFirst().orElse(null); }
    }

    @Test
    void presta_un_equipo_libre() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        assertNotNull(s.prestar("20231234", "proyector-01", "clase de redes", hoy));
        assertEquals(1, s.prestamosDe("20231234").size());
    }

    @Test
    void no_presta_un_equipo_que_ya_esta_prestado() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        s.prestar("20231234", "proyector-01", "clase de redes", hoy);
        assertThrows(IllegalStateException.class, () -> s.prestar("20235678", "proyector-01", "clase de redes", hoy));
    }

    @Test
    void el_urgente_tambien_exige_quien_autoriza() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        assertThrows(IllegalArgumentException.class, () -> s.prestarUrgente("20231234", "laptop-03", "", "clase de redes", hoy));
    }

    @Test
    void al_devolver_el_equipo_queda_libre() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        String id = s.prestar("20231234", "laptop-03", "clase de redes", hoy);
        s.devolver(id);
        assertDoesNotThrow(() -> s.prestar("20235678", "laptop-03", "clase de redes", hoy));
    }

    @Test
    void rechaza_tercer_equipo_normal_y_urgente() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
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
        PrestamoService s = new PrestamoService(new RepositorioFalso());
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
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        String id = s.prestar("20231234", "equipo-1", "clase de redes", hoy);
        s.prestar("20231234", "equipo-2", "proyecto", hoy);
        s.devolver(id);
        assertEquals("clase de redes", s.prestamosDe("20231234").stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().motivo());
        assertDoesNotThrow(() -> s.prestar("20231234", "equipo-3", "sustentación", hoy));
        assertEquals(3, s.prestamosDe("20231234").size());
    }

    @Test
    void el_tope_es_independiente_para_cada_alumno() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        s.prestar("20231234", "equipo-1", "clase", hoy);
        s.prestar("20231234", "equipo-2", "proyecto", hoy);
        assertDoesNotThrow(() -> s.prestar("20235678", "equipo-3", "clase", hoy));
    }

    @Test
    void guarda_motivo_y_conserva_plazos_normal_y_urgente() {
        PrestamoService s = new PrestamoService(new RepositorioFalso());
        s.prestar("20231234", "equipo-1", "clase", hoy);
        s.prestarUrgente("20231234", "equipo-2", "jefe", "proyecto", hoy);
        assertEquals("clase", s.prestamosDe("20231234").get(0).motivo());
        assertEquals("proyecto", s.prestamosDe("20231234").get(1).motivo());
        assertEquals(hoy.plusDays(7), s.prestamosDe("20231234").get(0).devolucion());
        assertEquals(hoy.plusDays(1), s.prestamosDe("20231234").get(1).devolucion());
    }
}
