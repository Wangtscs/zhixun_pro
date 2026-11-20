package com.nephh.system.entity;
import lombok.Data;
import com.baomidou.mybatisplus.annotation.TableName;
@Data
@TableName("sys_role")
public class SysRole { private Long id; private String code; private String name; }
