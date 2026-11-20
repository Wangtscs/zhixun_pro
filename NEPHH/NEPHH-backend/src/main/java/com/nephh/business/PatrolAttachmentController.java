package com.nephh.business;
import com.nephh.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.core.io.FileSystemResource;
import org.springframework.beans.factory.annotation.Value;
import java.nio.file.*;
import java.util.*;
import static com.nephh.business.AccessService.*;

@RestController @RequestMapping("/api/business/patrol")
public class PatrolAttachmentController {
 private final JdbcTemplate db;private final AccessService access;private final Path files;
 public PatrolAttachmentController(JdbcTemplate db,AccessService access,@Value("${app.upload-directory:.data/uploads}")String directory){this.db=db;this.access=access;this.files=Path.of(directory).toAbsolutePath().normalize();}
 private Map<String,Object> point(Actor a,long id){var row=access.one("select pr.*,r.assignee_id,p.area_id from patrol_result pr join patrol_run r on r.id=pr.run_id join patrol_plan p on p.id=r.plan_id where pr.id=?",id);access.area(a,((Number)row.get("area_id")).longValue());if(!a.manager()&&!Objects.equals(row.get("assignee_id"),a.id()))deny();return row;}
 @PostMapping("/results/{id}/attachments") public ApiResponse<?> upload(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestParam MultipartFile file)throws Exception{var a=access.actor(jwt);var row=point(a,id);if(!Objects.equals(row.get("assignee_id"),a.id())||row.get("checked_at")!=null)deny();if(file.isEmpty()||file.getSize()>5*1024*1024)bad("照片大小应在1字节至5MB之间");String type=file.getContentType();if(!Set.of("image/png","image/jpeg").contains(Objects.toString(type,"")))bad("巡检照片支持PNG或JPEG");byte[] bytes=file.getBytes();boolean valid=type.equals("image/png")?bytes.length>8&&(bytes[0]&255)==137&&bytes[1]==80&&bytes[2]==78&&bytes[3]==71:bytes.length>3&&(bytes[0]&255)==255&&(bytes[1]&255)==216;if(!valid)bad("图片内容与类型不符");String name=UUID.randomUUID().toString(),original=Objects.toString(file.getOriginalFilename(),"照片").replaceAll("[\\r\\n]","");if(original.length()>200)original=original.substring(original.length()-200);Files.createDirectories(files);Files.write(files.resolve(name),bytes);try{db.update("insert into patrol_attachment(result_id,uploader_id,original_name,storage_name,content_type) values(?,?,?,?,?)",id,a.id(),original,name,type);}catch(Exception e){Files.deleteIfExists(files.resolve(name));throw e;}access.audit(a,"UPLOAD","PATROL_POINT",id,null,original);return ApiResponse.ok(null);}
 @GetMapping("/attachments/{id}") public ResponseEntity<?> download(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){var a=access.actor(jwt);var row=access.one("select * from patrol_attachment where id=?",id);point(a,((Number)row.get("result_id")).longValue());Path path=files.resolve(row.get("storage_name").toString()).normalize();if(!path.startsWith(files)||!Files.isRegularFile(path))throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND,"照片不存在");return ResponseEntity.ok().header("X-Content-Type-Options","nosniff").contentType(MediaType.parseMediaType(row.get("content_type").toString())).body(new FileSystemResource(path));}
}
