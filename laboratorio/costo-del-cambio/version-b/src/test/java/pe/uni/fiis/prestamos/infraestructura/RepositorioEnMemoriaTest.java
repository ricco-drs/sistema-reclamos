package pe.uni.fiis.prestamos.infraestructura;

import org.junit.jupiter.api.Test;
import pe.uni.fiis.prestamos.dominio.Prestamo;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class RepositorioEnMemoriaTest {

    @Test
    void guarda_y_recupera_por_id() {
        RepositorioEnMemoria repo = new RepositorioEnMemoria();
        Prestamo p = new Prestamo("1", "20231234", "laptop-03", "clase de redes",
                LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 12), false);
        repo.guardar(p);
        assertEquals("laptop-03", repo.porId("1").equipo());
        assertEquals("clase de redes", repo.porId("1").motivo());
        assertEquals(1, repo.deAlumno("20231234").size());
    }
}
