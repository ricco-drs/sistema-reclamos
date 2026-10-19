package pe.uni.fiis.prestamos.dominio;

import java.util.List;

/** Lo que el dominio necesita de quien guarda los préstamos.
 *  La declara el dominio; la implementa la infraestructura. */
public interface RepositorioDePrestamos {
    void guardar(Prestamo prestamo);
    List<Prestamo> todos();
    List<Prestamo> deAlumno(String codigoAlumno);
    Prestamo porId(String id);
}
