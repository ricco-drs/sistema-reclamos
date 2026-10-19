package pe.uni.fiis.prestamos.infraestructura;

import pe.uni.fiis.prestamos.dominio.Prestamo;
import pe.uni.fiis.prestamos.dominio.RepositorioDePrestamos;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Una implementación del puerto. Acá iría JDBC, un archivo o lo que sea:
 *  el dominio no cambia cuando esto cambia. */
public class RepositorioEnMemoria implements RepositorioDePrestamos {

    private final Map<String, Prestamo> filas = new LinkedHashMap<>();

    @Override
    public void guardar(Prestamo prestamo) {
        filas.put(prestamo.id(), prestamo);
    }

    @Override
    public List<Prestamo> todos() {
        return new ArrayList<>(filas.values());
    }

    @Override
    public List<Prestamo> deAlumno(String codigoAlumno) {
        return filas.values().stream().filter(p -> p.codigoAlumno().equals(codigoAlumno)).toList();
    }

    @Override
    public Prestamo porId(String id) {
        return filas.get(id);
    }
}
